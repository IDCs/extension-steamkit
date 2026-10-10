// The .NET delegate and base types the generated declarations here refer to.
// node-api-dotnet presents a delegate to JS as a function.
declare module "node-api-dotnet" {
  export namespace System {
    export type Func$1<TResult> = () => TResult;
    export type Func$2<T, TResult> = (arg: T) => TResult;
    export type Action$2<T1, T2> = (arg1: T1, arg2: T2) => void;
    export class Exception {}
  }
}

export {};
