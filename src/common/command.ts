import yargs from 'yargs';

export type CommandArgType = { [argName: string]: unknown; _: (string | number)[]; $0: string };

abstract class CommandAbstract {
  constructor(yargs: yargs.Argv) {
    yargs.command(this.getName(), this.getDescription(), this.options.bind(this), this.execute.bind(this));
  }

  getName(): string {
    return '';
  }

  getDescription(): string {
    return '';
  }

  abstract options(yargs: yargs.Argv): void;
  abstract execute(argv: CommandArgType): Promise<number>;
}

export default CommandAbstract;
