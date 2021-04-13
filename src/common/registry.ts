import CommandAbstract, { CommandArgType } from './command';

export type CommandType = {
  [name: string]: CommandAbstract;
};

export class CommandRegistry {
  constructor(private commands: CommandType) {}

  static instance: CommandRegistry;

  static getInstance() {
    if (!CommandRegistry.instance) {
      CommandRegistry.instance = new CommandRegistry({});
    }
    return CommandRegistry.instance;
  }

  addCommand<T extends CommandAbstract>(command: T) {
    this.commands[command.getName()] = command;
  }
}

export default new CommandRegistry({});
