import { ReactiveVar } from 'meteor/reactive-var';
import { FlowRouter } from 'meteor/kadira:flow-router';
import { Template } from 'meteor/templating';
import toastr from 'toastr';

import { t, handleError, APIClient } from '../../../utils';
import { ProgressStep, ImportingStartedStates } from '../../lib/ImporterProgressStep';

import { ImporterWebsocketReceiver } from '..';

import './adminImportProgress.html';

Template.adminImportProgress.helpers({
	step() {
		return Template.instance().step.get();
	},
	completed() {
		return Template.instance().completed.get();
	},
	total() {
		return Template.instance().total.get();
	},
});

Template.adminImportProgress.onCreated(function() {
	const template = this;
	this.operation = new ReactiveVar(false);
	this.step = new ReactiveVar(t('Loading...'));
	this.completed = new ReactiveVar(0);
	this.total = new ReactiveVar(0);

	let importerKey = false;

	function _updateProgress(progress) {
		switch (progress.step) {
			case ProgressStep.DONE:
				toastr.success(t(progress.step[0].toUpperCase() + progress.step.slice(1)));
				return FlowRouter.go('/admin/import');
			case ProgressStep.ERROR:
			case ProgressStep.CANCELLED:
				toastr.error(t(progress.step[0].toUpperCase() + progress.step.slice(1)));
				return FlowRouter.go('/admin/import/prepare');
			default:
				template.step.set(t(progress.step[0].toUpperCase() + progress.step.slice(1)));
				template.completed.set(progress.count.completed);
				template.total.set(progress.count.total);
				break;
		}
	}

	this.progressUpdated = function _progressUpdated(progress) {
		if (progress.key.toLowerCase() !== importerKey) {
			return;
		}

		_updateProgress(progress);
	};

	APIClient.get('v1/getCurrentImportOperation').then((data) => {
		const { operation } = data;

		template.operation.set(operation);
		importerKey = operation.importerKey;

		// If the import has not started, move to the prepare screen
		if (!ImportingStartedStates.includes(operation.status)) {
			return FlowRouter.go('/admin/import/prepare');
		}

		APIClient.get('v1/getImportProgress', { importerKey }).then((progress) => {
			if (!progress) {
				toastr.warning(t('Importer_not_in_progress'));
				return FlowRouter.go('/admin/import/prepare');
			}

			const whereTo = _updateProgress(progress);

			if (!whereTo) {
				ImporterWebsocketReceiver.registerCallback(template.progressUpdated);
			}
		}).catch((error) => {
			console.warn('Error on getting the import progress:', error);

			if (error) {
				handleError(error);
			} else {
				toastr.error(t('Failed_To_Load_Import_Data'));
			}

			return FlowRouter.go('/admin/import');
		});
	}).catch((error) => {
		if (error) {
			handleError(error);
		} else {
			toastr.error(t('Failed_To_Load_Import_Data'));
		}
		return FlowRouter.go('/admin/import');
	});
});

Template.adminImportProgress.onDestroyed(function() {
	ImporterWebsocketReceiver.unregisterCallback(this.progressUpdated);
});
