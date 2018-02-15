import * as React from 'react';
// @ts-ignore
import { Icon, NavItem } from 'react-materialize';

export default class UploadNotepadsComponent extends React.Component {
	private uploadInput: HTMLInputElement;

	render() {
		return (
			<NavItem href="#!" onClick={this.triggerUpload}>
				<Icon left={true}>file_upload</Icon> Upload
				<input ref={input => this.uploadInput = input!} onChange={this.onUploadChanged} style={{ display: 'none' }} type="file" />
			</NavItem>
		);
	}

	private triggerUpload = () => {
		this.uploadInput.click();
	}

	private onUploadChanged = (event) => {
		// Ensure we can re-upload the same file again
		this.uploadInput.value = '';
	}
}
