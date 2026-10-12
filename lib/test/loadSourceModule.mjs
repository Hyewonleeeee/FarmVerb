import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const requirePackage = createRequire(import.meta.url);

// Exercise the real application modules with isolated browser/network fixtures.
// Nothing is emitted to disk, and unexpected fetches cannot reach a live service.
export function createSourceLoader({ mocks = {}, globals = {} } = {}) {
  const cache = new Map();
  const context = vm.createContext({
    console,
    process: { env: {} },
    URL,
    URLSearchParams,
    Request,
    Response,
    Headers,
    Event,
    Error,
    setTimeout,
    clearTimeout,
    fetch: () => { throw new Error('Unexpected network request in isolated test.'); },
    ...globals
  });

  function load(fileName) {
    const absolutePath = path.resolve(root, fileName);
    if (cache.has(absolutePath)) {
      return cache.get(absolutePath).exports;
    }
    const loadedModule = { exports: {} };
    cache.set(absolutePath, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(absolutePath, 'utf8'), {
      fileName: absolutePath,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX
      }
    }).outputText;
    const requireDependency = (id) => {
      if (Object.hasOwn(mocks, id)) {
        return mocks[id];
      }
      if (id.startsWith('@/') || id.startsWith('.')) {
        const base = id.startsWith('@/')
          ? path.join(root, id.slice(2))
          : path.resolve(path.dirname(absolutePath), id);
        const resolved = [base, `${base}.ts`, `${base}.tsx`].find((candidate) => (
          fs.existsSync(candidate) && fs.statSync(candidate).isFile()
        ));
        if (!resolved) {
          throw new Error(`Cannot resolve local dependency ${id}`);
        }
        return load(resolved);
      }
      return requirePackage(id);
    };
    const evaluate = vm.runInContext(`(function (module, exports, require) {\n${source}\n})`, context, {
      filename: absolutePath
    });
    evaluate(loadedModule, loadedModule.exports, requireDependency);
    return loadedModule.exports;
  }

  return load;
}
