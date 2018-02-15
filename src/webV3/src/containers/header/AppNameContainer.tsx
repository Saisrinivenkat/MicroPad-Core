import { IStoreState } from '../../types/index';
import { connect } from 'react-redux';
import AppNameComponent from '../../components/header/AppNameComponent/AppNameComponent';

export function mapStateToProps({ meta }: IStoreState) {
	return meta.version;
}

export default connect(mapStateToProps)(AppNameComponent);
