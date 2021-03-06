import * as React from 'react';
import { CSSProperties } from 'react';
import './NotepadExplorerComponent.css';
import { Icon } from 'react-materialize';
import TreeView from 'react-treeview';
import { generateGuid } from '../../util';
import ExplorerOptionsComponent from './explorer-options/ExplorerOptionsContainer';
import { NewNotepadObjectAction } from '../../types/ActionTypes';
import HelpMessageComponent from '../../containers/HelpMessageContainer';
import { Dialog } from '../../services/dialogs';
import SyncOptionsComponent from '../../containers/SyncOptionsContainer';
import { Note, Parent, Section } from 'upad-parse/dist';
import { NEW_SECTION_HELP, OPEN_NOTE_HELP, OPEN_NOTEPAD_HELP } from '../../types';
import DueDateListComponent from './due-date-list/DueDateListContainer';
import AppSettingsComponent from './app-settings/AppSettingsContainer';

// @ts-ignore
import NewSectionVideo from '../../assets/instructions/new-section.mp4';
// @ts-ignore
import OpenNoteVideo from '../../assets/instructions/open-note.mp4';
// @ts-ignore
import OpenNotepadVideo from '../../assets/instructions/open-notepad.mp4';
import { notepadExplorerConnector } from './NotepadExplorerContainer';
import { ConnectedProps } from 'react-redux';

export default class NotepadExplorerComponent extends React.Component<ConnectedProps<typeof notepadExplorerConnector>> {
	render() {
		const { notepad, theme } = this.props;
		const openSections = new Set<string>(this.props.openSections);

		const notepadExplorerStyle: CSSProperties = {
			display: 'initial',
			transition: 'background-color .3s',
			backgroundColor: theme.chrome,
			borderLeft: `2px solid ${theme.accent}`,
			color: theme.explorerContent
		};
		if (this.props.isFullScreen) notepadExplorerStyle.display = 'none';

		// Generate TreeViews
		const treeViews: JSX.Element[] = [];
		notepad?.sections?.forEach(section => treeViews.push(this.generateSectionTreeView(section, openSections)));

		return (
			<div id="notepad-explorer" style={notepadExplorerStyle}>
				<div style={{ paddingRight: '5px' }}>
					<a href="#!" onClick={this.props.flipFullScreenState}
					   style={{ paddingRight: '5px', fontSize: '24px' }}>??</a>
					<DueDateListComponent/>
				</div>

				{
					!!notepad &&
					<div>
						<strong style={{ display: 'inline-flex' }}
						        onContextMenu={NotepadExplorerComponent.handleRightClick}>
							<span style={{ paddingRight: '5px' }}>{notepad.title}</span>
							<ExplorerOptionsComponent objToEdit={notepad} type="notepad"/>
						</strong>

						<p style={{ marginTop: '0px' }}>
							(<a href="#!" onClick={this.props.expandAll}>Expand All</a> | <a href="#!" onClick={() => {
							if (!!this.props.openNote) {
								this.props.collapseAll();
								this.props.expandFromNote(this.props.openNote);
							}
						}}>Focus</a> | <a href="#!" onClick={this.props.collapseAll}>Collapse All</a>)
						</p>

						<div className="explorer-note add-button" key={generateGuid()} style={{ margin: 0 }}>
							<a href="#!" style={{ color: theme.explorerContent }}
							   onClick={() => this.newNotepadObject('section', notepad)}> <Icon>add</Icon> Section</a>
						</div>

						{treeViews}

						<div style={{ paddingLeft: '10px', marginTop: '10px' }}>
							<SyncOptionsComponent/>
						</div>

						{
							/* Help messages */
							!this.props.openNote &&
							<React.Fragment>
								{
									(
										notepad.sections.length === 0 ||
										notepad.sections.some(s => s.notes.length === 0 && s.sections.length === 0)
									) &&
									<HelpMessageComponent
										message={NEW_SECTION_HELP}
										video={NewSectionVideo}/>
								}
								{
									(
										notepad.sections.length > 0 &&
										notepad.sections.every(s => (s.notes.length > 0 || s.sections.length > 0))
									) &&
									<HelpMessageComponent
										message={OPEN_NOTE_HELP}
										video={OpenNoteVideo}/>
								}
							</React.Fragment>
						}
					</div>
				}

				{
					!notepad &&
					<HelpMessageComponent
						message={OPEN_NOTEPAD_HELP}
						video={OpenNotepadVideo}/>
				}

				{!!notepad && <hr/>}
				<div style={{ paddingBottom: '200px' }}>
					<AppSettingsComponent/>
				</div>
			</div>
		);
	}

	private async newNotepadObject(type: 'note' | 'section', parent: Parent) {
		const { newNote, newSection } = this.props;
		const title = await Dialog.prompt('Title:');

		if (title) {
			const action: NewNotepadObjectAction = {
				title,
				parent: (parent as Section).internalRef // will automatically be undefined for Notepad parents
			};

			(type === 'note') ? newNote!(action) : newSection!(action);
		}
	}

	private generateSectionTreeView(section: Section, openSections: Set<string>): JSX.Element {
		const { theme, loadNote } = this.props;

		const nodeLabelStyle = {
			display: 'inline-flex',
			verticalAlign: 'middle',
			paddingBottom: '10px',
			paddingTop: '10px'
		};

		const childSections: JSX.Element[] = [];
		((section || {} as Section).sections || [])
			.forEach((child: Section) => childSections.push(this.generateSectionTreeView(child, openSections)));

		const childNotes: JSX.Element[] = [];
		((section || {} as Section).notes || [])
			.forEach((child: Note) => childNotes.push(
				<div className="explorer-note" key={generateGuid()}>
					<span>
						<a
							href="#!"
							style={{ color: theme.explorerContent }} onClick={() => loadNote(child.internalRef)}
							onContextMenu={NotepadExplorerComponent.handleRightClick}>
							<Icon>note</Icon> {child.title}
						</a>
						<ExplorerOptionsComponent objToEdit={child} type="note"/>
					</span>
				</div>
			));

		return (
			<TreeView
				key={generateGuid()}
				onClick={() => this.sectionArrowClick(section.internalRef, openSections)}
				nodeLabel={
					<span>
						<span
							style={nodeLabelStyle}
							onClick={() => this.sectionArrowClick(section.internalRef, openSections)}
							onContextMenu={NotepadExplorerComponent.handleRightClick}>
							<Icon>book</Icon> {section.title}
						</span>

						<ExplorerOptionsComponent objToEdit={section} type="section"/>
					</span>
				}
				collapsed={!openSections.has(section.internalRef)}>
				<div className="explorer-note add-button" key={generateGuid()}>
					<a href="#!" style={{ color: theme.explorerContent, paddingRight: '3px' }}
					   onClick={() => this.newNotepadObject('note', section)}>
						<Icon>add</Icon> Note
					</a>
					<a href="#!" style={{ color: theme.explorerContent, paddingLeft: '3px' }}
					   onClick={() => this.newNotepadObject('section', section)}>
						<Icon>add</Icon> Section
					</a>
				</div>

				{childSections}
				{childNotes}
			</TreeView>
		);
	}

	private sectionArrowClick(guid: string, openSections: Set<string>) {
		const { expandSection, collapseSection } = this.props;

		if (openSections.has(guid)) {
			collapseSection(guid);
		} else {
			expandSection(guid);
		}
	}

	private static handleRightClick(e: React.MouseEvent<HTMLElement, MouseEvent>): boolean {
		e.preventDefault();
		(e.target as Node).parentElement?.querySelector<HTMLAnchorElement>('.exp-options-trigger')?.click();
		return false;
	}
}
