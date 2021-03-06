import { actions } from '../actions';
import {
	catchError,
	concatMap,
	debounceTime,
	distinctUntilChanged,
	filter,
	map,
	mergeMap,
	switchMap,
	tap
} from 'rxjs/operators';
import { Action, isType, Success } from 'redux-typescript-actions';
import { combineEpics, ofType } from 'redux-observable';
import { INotepadStoreState } from '../types/NotepadTypes';
import { IStoreState } from '../types';
import * as localforage from 'localforage';
import { from, Observable, of } from 'rxjs';
import { Dialog } from '../services/dialogs';
import { ISyncedNotepad } from '../types/SyncTypes';
import { FlatNotepad, Note, Notepad } from 'upad-parse/dist';
import { NoteElement } from 'upad-parse/dist/Note';
import { elvis, filterTruthy, getUsedAssets, isAction, resolveElvis } from '../util';
import { MiddlewareAPI } from 'redux';
import { fromShell } from '../services/CryptoService';
import { AddCryptoPasskeyAction, DeleteElementAction, EncryptNotepadAction } from '../types/ActionTypes';
import { NotepadShell } from 'upad-parse/dist/interfaces';
import { ASSET_STORAGE, NOTEPAD_STORAGE } from '../root';
import { ICurrentNoteState } from '../reducers/NoteReducer';
import { EpicDeps } from './index';

let currentNotepadTitle = '';

const saveNotepad$ = (actions$: Observable<Action<any>>, store: MiddlewareAPI<IStoreState>) =>
	actions$.pipe(
		ofType<Action<Notepad>>(actions.saveNotepad.started.type),
		map((action: Action<Notepad>) => action.payload),
		concatMap((notepad: Notepad) =>
			from((async () =>
					await NOTEPAD_STORAGE.setItem(
						notepad.title,
						await notepad.toJson(!!notepad.crypto ? store.getState().notepadPasskeys[notepad.title] : undefined)
					)
			)()).pipe(
				catchError(err => of(actions.saveNotepad.failed({ params: {} as Notepad, error: err }))),
				map(() => actions.saveNotepad.done({ params: {} as Notepad, result: undefined }))
			)
		)
	);

const saveOnChanges$ = (action$, store: MiddlewareAPI<IStoreState>) =>
	action$.pipe(
		map(() => store.getState()),
		map((state: IStoreState) => state.notepads.notepad),
		filter(Boolean),
		map((notepadState: INotepadStoreState) => notepadState.item),
		filter(Boolean),
		debounceTime(1000),
		distinctUntilChanged(),
		filter((notepad: FlatNotepad) => {
			const condition = notepad.title === currentNotepadTitle;
			currentNotepadTitle = notepad.title;

			return condition;
		}),
		map((notepad: FlatNotepad) => notepad.toNotepad()),
		mergeMap((notepad: Notepad) => {
			const actionsToReturn: Action<any>[] = [];

			const syncId = (store.getState() as IStoreState).notepads.notepad!.activeSyncId;
			if (syncId) actionsToReturn.push(actions.actWithSyncNotepad({
				notepad,
				action: (np: ISyncedNotepad) => actions.sync({ notepad: np, syncId })
			}));

			return [
				...actionsToReturn,
				actions.saveNotepad.started(notepad)
			];
		})
	);

const saveDefaultFontSize$ = (action$, store: MiddlewareAPI<IStoreState>) =>
	action$.pipe(
		map(() => store.getState()),
		map((state: IStoreState) => [state.notepads.notepad, state.currentNote]),
		filter(([notepad, current]: [INotepadStoreState, ICurrentNoteState]) => !!notepad && !!notepad.item && !!current && current.ref.length > 0),
		map(([notepad, current]: [INotepadStoreState, ICurrentNoteState]) => [notepad.item!.notes[current.ref], current.elementEditing]),
		filter(([note, id]: [Note, string]) => !!note && id.length > 0),
		map(([note, id]: [Note, string]) => note.elements.filter((element: NoteElement) => element.args.id === id)[0]),
		filter(Boolean),
		map((element: NoteElement) => element.args.fontSize),
		filter(Boolean),
		distinctUntilChanged(),
		tap((fontSize: string) => localforage.setItem('font size', fontSize)),
		map((fontSize: string) => actions.updateDefaultFontSize(fontSize))
	);

const getNotepadList$ = action$ =>
	action$.pipe(
		filter((action: Action<void>) => isType(action, actions.getNotepadList.started)),
		switchMap(() =>
			from(NOTEPAD_STORAGE.keys()).pipe(
				map((keys: string[]) => {
					return actions.getNotepadList.done({ params: undefined, result: keys });
				}),
				catchError(err => of(actions.getNotepadList.failed({ params: undefined, error: err })))
			)
		)
	);

const openNotepadFromStorage$ = (actions$: Observable<Action<any>>, store: MiddlewareAPI<IStoreState>) =>
	actions$.pipe(
		ofType<Action<string>>(actions.openNotepadFromStorage.started.type),
		map((action: Action<string>) => action.payload),
		switchMap((notepadTitle: string) =>
			from(NOTEPAD_STORAGE.getItem<string>(notepadTitle)).pipe(
				switchMap((json: string | null) => {
					return from(fromShell(JSON.parse(json!), store.getState().notepadPasskeys[notepadTitle]));
				}),
				mergeMap((res: EncryptNotepadAction) => [
					actions.addCryptoPasskey({ notepadTitle: res.notepad.title, passkey: res.passkey }),
					actions.openNotepadFromStorage.done({ params: '', result: undefined }),
					actions.parseNpx.done({ params: '', result: res.notepad.flatten() }),
				]),
				catchError(err => {
					console.error(err);
					Dialog.alert(`Error opening notepad`);
					return of(actions.openNotepadFromStorage.failed(err));
				})
			)
		)
	);

const cleanUnusedAssets$ = (actions$: Observable<Action<Success<string, FlatNotepad>> | Action<DeleteElementAction>>, store: MiddlewareAPI<IStoreState>) =>
	actions$
		.pipe(
			ofType<Action<Success<string, FlatNotepad>> | Action<DeleteElementAction>>(actions.parseNpx.done.type, actions.deleteElement.type),
			map(() => store.getState()),
			map((state: IStoreState) => state.notepads.notepad),
			filterTruthy(),
			map((notepadState: INotepadStoreState) => notepadState.item),
			filterTruthy(),
			map((notepad: FlatNotepad): [Set<string>, string[]] => [getUsedAssets(notepad), notepad.notepadAssets]),
			filter(([usedAssets, npAssets]: [Set<string>, string[]]) => !!usedAssets && !!npAssets),
			switchMap(([usedAssets, npAssets]: [Set<string>, string[]]) => {
				const unusedAssets = npAssets.filter(guid => !usedAssets.has(guid));
				return from(Promise.all(unusedAssets.map(guid => ASSET_STORAGE.removeItem(guid))).then(() => unusedAssets));
			}),
			mergeMap((unusedAssets: string[]) => [
				...unusedAssets.map(guid => actions.untrackAsset(guid))
			]),
			filter((res: Action<any>[]) => res.length > 0)
		);

const deleteNotepad$ = action$ =>
	action$.pipe(
		filter((action: Action<string>) => isType(action, actions.deleteNotepad)),
		map((action: Action<string>) => action.payload),
		tap((notepadTitle: string) => from(NOTEPAD_STORAGE.removeItem(notepadTitle))),
		filter(() => false)
	);

export type LastOpenedNotepad = { notepadTitle: string, noteRef?: string };
const persistLastOpenedNotepad$ = (actions$: Observable<Action<any>>, _store, { getStorage }: EpicDeps) =>
	actions$.pipe(
		ofType<Action<Success<string, FlatNotepad>>>(actions.parseNpx.done.type),
		map(action => action.payload.result),
		tap((notepad: FlatNotepad) =>
			getStorage()
				.generalStorage
				.setItem<LastOpenedNotepad>('last opened notepad', { notepadTitle: notepad.title, noteRef: undefined })
				.catch(() => { return; })
		),
		filter(() => false)
	);

const persistLastOpenedNote$ = (actions$: Observable<Action<any>>, store: MiddlewareAPI<IStoreState>, { getStorage }: EpicDeps) =>
	actions$.pipe(
		ofType<Action<Success<string, object>>>(actions.loadNote.done.type),
		filter(() => !!store.getState().notepads.notepad?.item),
		map((action): LastOpenedNotepad => ({
			notepadTitle: store.getState().notepads.notepad?.item?.title!,
			noteRef: action.payload.params
		})),
		tap(lastOpened =>
			getStorage()
				.generalStorage
				.setItem<LastOpenedNotepad>('last opened notepad', lastOpened)
				.catch(() => { return; })
		),
		filter(() => false)
	);

const clearLastOpenNoteOnClose$ = (actions$: Observable<Action<any>>, store: MiddlewareAPI<IStoreState>, { getStorage }: EpicDeps) =>
	actions$.pipe(
		ofType<Action<void>>(actions.closeNote.type),
		map(() => store.getState().notepads.notepad?.item?.title),
		tap(currentNotepad => {
			if (currentNotepad) {
				getStorage()
					.generalStorage
					.setItem<LastOpenedNotepad>('last opened notepad', { notepadTitle: currentNotepad })
					.catch(() => { return; })
			} else {
				getStorage()
					.generalStorage
					.removeItem('last opened notepad')
					.catch(() => { return; })
			}
		}),
		filter(() => false)
	);

const clearLastOpenedNotepad$ = (action$: Observable<Action<Success<string, FlatNotepad>>>) =>
	action$.pipe(
		isAction(actions.closeNotepad, actions.parseNpx.failed, actions.deleteNotepad, actions.renameNotepad.done),
		tap(() =>
			localforage
				.setItem('last opened notepad', undefined)
				.catch(() => { return; })
		),
		filter(() => false)
	);

const clearOldData$ = (action$: Observable<Action<void>>, store: MiddlewareAPI<IStoreState>) =>
	action$.pipe(
		isAction(actions.clearOldData.started),
		concatMap(() =>
			from(cleanHangingAssets(NOTEPAD_STORAGE, ASSET_STORAGE, store.getState())).pipe(
				mergeMap((addPasskeyActions: Action<AddCryptoPasskeyAction>[]) => [
					actions.clearOldData.done({ params: undefined, result: undefined }),
					...addPasskeyActions
				]),
				catchError(error => {
					Dialog.alert('There was an error clearing old data');
					console.error(error);
					return of(actions.clearOldData.failed({ params: undefined, error }));
				})
			)
		)
	);

const notifyOnClearOldDataSuccess$ = (action$: Observable<Action<Success<void, void>>>) =>
	action$.pipe(
		isAction(actions.clearOldData.done),
		tap(() => Dialog.alert('The spring cleaning has been done!')),
		filter(() => false)
	);

export const storageEpics$ = combineEpics(
	saveNotepad$,
	getNotepadList$,
 	openNotepadFromStorage$ as any,
	deleteNotepad$,
	saveOnChanges$,
	saveDefaultFontSize$,
	cleanUnusedAssets$,
	persistLastOpenedNotepad$,
	persistLastOpenedNote$,
	clearLastOpenNoteOnClose$,
	clearLastOpenedNotepad$,
	clearOldData$,
	notifyOnClearOldDataSuccess$
);

/**
 *  Clean up all the assets that aren't in any notepads yet
 */
async function cleanHangingAssets(notepadStorage: LocalForage, assetStorage: LocalForage, state: IStoreState): Promise<Action<AddCryptoPasskeyAction>[]> {
	const cryptoPasskeys: Action<AddCryptoPasskeyAction>[] = [];

	const notepads: Promise<EncryptNotepadAction>[] = [];
	await notepadStorage.iterate((json: string) => {
		const shell: NotepadShell = JSON.parse(json);
		notepads.push(fromShell(shell, state.notepadPasskeys[shell.title]));

		return;
	});

	const allUsedAssets: Set<string> = new Set<string>();
	const resolvedNotepadsOrErrors = (await Promise.all(
		notepads
			.map(p => p.catch(err => err))
	));

	const areNotepadsStillEncrypted = !!resolvedNotepadsOrErrors.find(res => res instanceof Error);

	const resolvedNotepads = resolvedNotepadsOrErrors.filter(res => !(res instanceof Error)).map((cryptoInfo: EncryptNotepadAction) => {
		cryptoPasskeys.push(actions.addCryptoPasskey({ notepadTitle: cryptoInfo.notepad.title, passkey: cryptoInfo.passkey }));
		return cryptoInfo.notepad;
	});

	// Handle deletion of unused assets, same as what's done in the epic
	for (let notepad of resolvedNotepads) {
		const assets = notepad.notepadAssets;
		const usedAssets = getUsedAssets(notepad.flatten());
		const unusedAssets = assets.filter(uuid => !usedAssets.has(uuid));
		usedAssets.forEach(uuid => allUsedAssets.add(uuid));

		await Promise.all(unusedAssets.map(uuid => assetStorage.removeItem(uuid)));

		// Update notepadAssets
		notepad = notepad.clone({ notepadAssets: Array.from(usedAssets) });

		await notepadStorage.setItem(
			notepad.title,
			await notepad.toJson(
				resolveElvis(
					elvis(cryptoPasskeys.find(action => action.payload.notepadTitle === notepad.title))
					.payload
					.passkey
				)
			)
		);
	}

	if (areNotepadsStillEncrypted) return cryptoPasskeys;

	// Handle the deletion of assets we've lost track of and aren't in any notepad
	let lostAssets: string[] = [];
	await assetStorage.iterate((value, key) => {
		lostAssets.push(key);
		return;
	});
	lostAssets = lostAssets.filter(uuid => !allUsedAssets.has(uuid));

	for (const uuid of lostAssets) {
		await assetStorage.removeItem(uuid);
	}

	return cryptoPasskeys;
}
