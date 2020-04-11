import { window, commands, ExtensionContext, QuickPickItem, Disposable, CancellationToken, QuickInputButton, QuickInput, QuickInputButtons, Uri } from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {

	let disposable = commands.registerCommand('azuredevopsyamlgenerator.helloWorld', async () => {
		configureYaml(context);
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }

interface State {
	title: string;
	step: number;
	totalSteps: number;
	resourceGroup: QuickPickItem | string;
	name: string;
	runtime: QuickPickItem;
}

class MyButton implements QuickInputButton {
	constructor(public iconPath: { light: Uri; dark: Uri; }, public tooltip: string) { }
}

export async function configureYaml(context: ExtensionContext) {

	const createResourceGroupButton = new MyButton({
		dark: Uri.file(context.asAbsolutePath('resources/dark/add.svg')),
		light: Uri.file(context.asAbsolutePath('resources/light/add.svg')),
	}, 'Create Resource Group');

	async function chooseFileName(input: MultiStepInput, state: Partial<State>) {
		const title = 'Give a name to your yaml pipeline file';

		state.resourceGroup = await input.showInputBox({
			title,
			value: 'azure-pipelines.yml',
			prompt: 'Give a name to your yaml pipeline file',
			validate: validateFileName,
			shouldResume: shouldResume
		});

		async function validateFileName(name: string) {
			return name.endsWith('.yml') ? undefined : 'Make sure your file extension is \'.yml\'';
		}

		window.showInformationMessage(`You choose: ${state.resourceGroup}`);

		return (input: MultiStepInput) => chooseTechnology(input, state);
	}

	async function chooseTechnology(input: MultiStepInput, state: Partial<State>) {

		const resourceGroups: QuickPickItem[] = ['Xamarin.iOS', 'Xamarin.Android', 'Xamarin.Forms', 'UWP', 'iOS', 'Android']
			.sort((a, b) => (a > b ? -1 : 1)).map(label => ({ label }));

		const title = 'Which technology do you use?';

		const pick = await input.showQuickPick({
			title,
			placeholder: '',
			items: resourceGroups,
			activeItem: typeof state.resourceGroup !== 'string' ? state.resourceGroup : undefined,
			buttons: [createResourceGroupButton],
			shouldResume: shouldResume
		});

		if (pick instanceof MyButton) {
			window.showInformationMessage("Button");
		} else {
			state.resourceGroup = pick;
			window.showInformationMessage("Pick");
			return (input: MultiStepInput) => inputResourceGroupName(input, state);
		}
		return (input: MultiStepInput) => inputResourceGroupName(input, state);
	}

	async function inputResourceGroupName(input: MultiStepInput, state: Partial<State>) {
		window.showInformationMessage("Follow");
		const title = 'Which technology do you use?';

		state.resourceGroup = await input.showInputBox({
			title,
			step: 2,
			totalSteps: 4,
			value: typeof state.resourceGroup === 'string' ? state.resourceGroup : '',
			prompt: 'Choose a unique name for the resource group',
			validate: validateNameIsUnique,
			shouldResume: shouldResume
		});

		async function validateNameIsUnique(name: string) {
			// ...validate...
			await new Promise(resolve => setTimeout(resolve, 1000));
			return name === 'vscode' ? 'Name not unique' : undefined;
		}

		//return (input: MultiStepInput) => inputName(input, state);
	}

	function shouldResume() {
		// Could show a notification with the option to resume.
		return new Promise<boolean>((resolve, reject) => {

		});
	}

	const state = {} as Partial<State>;
	await MultiStepInput.run(input => chooseFileName(input, state));

	window.showInformationMessage('Generation done.');
}

// -------------------------------------------------------
// Helper code that wraps the API for the multi-step case.
// -------------------------------------------------------

class InputFlowAction {
	private constructor() { }
	static back = new InputFlowAction();
	static cancel = new InputFlowAction();
	static resume = new InputFlowAction();
}

type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

interface QuickPickParameters<T extends QuickPickItem> {
	title: string;
	items: T[];
	placeholder: string;
	shouldResume: () => Thenable<boolean>;
	step?: number;
	totalSteps?: number;
	activeItem?: T;
	buttons?: QuickInputButton[];
}

interface InputBoxParameters {
	title: string;
	value: string;
	prompt: string;
	validate: (value: string) => Promise<string | undefined>;
	shouldResume: () => Thenable<boolean>;
	step?: number;
	totalSteps?: number;
	buttons?: QuickInputButton[];
}

class MultiStepInput {

	static async run<T>(start: InputStep) {
		const input = new MultiStepInput();
		return input.stepThrough(start);
	}

	private current?: QuickInput;
	private steps: InputStep[] = [];

	private async stepThrough<T>(start: InputStep) {
		let step: InputStep | void = start;
		while (step) {
			this.steps.push(step);
			if (this.current) {
				this.current.enabled = false;
				this.current.busy = true;
			}
			try {
				step = await step(this);
			} catch (err) {
				if (err === InputFlowAction.back) {
					this.steps.pop();
					step = this.steps.pop();
				} else if (err === InputFlowAction.resume) {
					step = this.steps.pop();
				} else if (err === InputFlowAction.cancel) {
					step = undefined;
				} else {
					throw err;
				}
			}
		}
		if (this.current) {
			this.current.dispose();
		}
	}

	async showQuickPick<T extends QuickPickItem, P extends QuickPickParameters<T>>({ title, step, totalSteps, items, activeItem, placeholder, buttons, shouldResume }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<T | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = window.createQuickPick<T>();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.placeholder = placeholder;
				input.items = items;

				if (activeItem) {
					input.activeItems = [activeItem];
				}

				input.buttons = [
					...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
					...(buttons || [])
				];

				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidChangeSelection(items => resolve(items[0])),
					input.onDidHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					})
				);

				if (this.current) {
					this.current.dispose();
				}

				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}

	async showInputBox<P extends InputBoxParameters>({ title, step, totalSteps, value, prompt, validate, buttons, shouldResume }: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<string | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = window.createInputBox();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.value = value || '';
				input.prompt = prompt;
				input.buttons = [
					...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
					...(buttons || [])
				];
				let validating = validate('');
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidAccept(async () => {
						const value = input.value;
						input.enabled = false;
						input.busy = true;
						if (!(await validate(value))) {
							resolve(value);
						}
						input.enabled = true;
						input.busy = false;
					}),
					input.onDidChangeValue(async text => {
						const current = validate(text);
						validating = current;
						const validationMessage = await current;
						if (current === validating) {
							input.validationMessage = validationMessage;
						}
					}),
					input.onDidHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}
}