import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const routes = {
  registry: 'Registry createRegistry CodeActionDefinition CodeActionSpec ActionHandler ActionContext ChildActionRequest ComponentContract',
  runtime: 'Runtime createRuntime RuntimeOptions ViewTarget InitialReport ApplicationResult PublicError TimerClock',
  view: 'View ViewSnapshot NodeSnapshot QueryHandle QuerySnapshot ActionSnapshot',
  'state-store': 'StateStore createStateStore StateScope StateHandle StateAddress StateDeclaration StoreObservation ValueSnapshot Clock',
  url: 'UrlAdapter UrlConnection mergeOwnedUrl',
  http: 'HttpExecutorOptions createHttpExecutor HttpExecutionPlan HttpResponse RequestExecutor',
  cel: 'CelOptions CelLimits CelFunction CelValue compileCel evaluateCel defaultCelLimits',
  utilities: 'GridConfig GridPlacement computeGridLayout',
  types: 'Awaitable DeepReadonly JsonValue',
  '../dsl/types': 'Schema TypeContract',
  '../dsl/resources': 'ResourceKind Resource ResourceSpecs AnyResource RegisteredResource',
  '../dsl/values': 'ValueExpression InputExpressions PathExpression',
  '../dsl/state-and-ports': 'VariableSpec ValuePort StatePort QueryPort Port ResourceStateDeclaration Reaction',
  '../dsl/actions': 'ActionSpec ActionCall Step',
  '../dsl/datasources': 'HttpRequest DatasourceSpec',
  '../dsl/queries': 'QuerySource TransformStep QuerySpec QueryUse QueryDefaults',
  '../dsl/view-and-component': 'ComponentPublicContract ComponentSpec ViewSpec ComponentNode',
};
const routeOf = Object.fromEntries(Object.entries(routes).flatMap(([route, names]) => names.split(' ').map(name => [name, route])));
export function inventory() {
  const result = [];
  for (const [entry, file] of [['@viewstem/core','index.d.ts'],['@viewstem/core/http','http.d.ts'],['@viewstem/core/cel','cel.d.ts']]) {
    const source = fs.readFileSync(path.join(root, 'packages/core/src', file), 'utf8');
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    for (const node of sf.statements) {
      let names = [];
      if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        names = node.name ? [node.name.text] : ts.isVariableStatement(node) ? node.declarationList.declarations.map(d => d.name.getText(sf)) : [];
      } else if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) names = node.exportClause.elements.map(e => e.name.text);
      for (const name of names) {
        if (!routeOf[name]) throw new Error(`Unmapped public Core export: ${entry} ${name}`);
        const route = path.posix.normalize(`/docs/core/${routeOf[name]}/`);
        result.push({ entry, name, route, source: `packages/core/src/${file}`, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
      }
    }
  }
  return result;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(inventory(), null, 2));
