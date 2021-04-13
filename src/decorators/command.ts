export default function Command(name: string, description: string) {
  return function(target: Function) {
    target.prototype.getName = () => name;
    target.prototype.getDescription = () => description;
  };
}
