// Structural reference for the JSON accepted by Core's registry. Context checks
// (references, port compatibility, CEL, expression values, execution) belong to Core.
export const draft = 'https://json-schema.org/draft/2020-12/schema';
export const resourceKinds = ['View', 'Component', 'Variable', 'Query', 'Datasource', 'Action', 'Type'];
export const schemaPages = {
  'view-and-component': ['View', 'Component'],
  'state-and-ports': ['Variable'],
  queries: ['Query'],
  datasources: ['Datasource'],
  actions: ['Action'],
  types: ['Type'],
};

const ref = name => ({ $ref: '#/$defs/' + name });
const str = { type: 'string' };
const name = { ...str, minLength: 1 };
const bool = { type: 'boolean' };
const num = { type: 'number' };
const nonnegative = { type: 'integer', minimum: 0 };
const array = (items, constraints = {}) => ({ type: 'array', items, ...constraints });
const map = additionalProperties => ({ type: 'object', additionalProperties });
const object = (properties, required = [], constraints = {}) => ({
  type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false, ...constraints,
});
const any = (...anyOf) => ({ anyOf });
const one = (...oneOf) => ({ oneOf });
const choose = (...keys) => one(...keys.map(key => ({ required: [key] })));
const literal = value => ({ const: value });
const pathPattern = '^/(?:[^~]|~[01])*$';
const directPath = root => object({ '@path': { ...str, pattern: '^/(?:' + root + ')/(?:[^/~]|~[01])*$' } }, ['@path']);
const escapedName = { pattern: '^(?:[^@]|@@|$)' };
const expressions = map(ref('ValueExpression'));
const value = ref('ValueExpression');
const condition = ref('BooleanExpression');
const contractFields = { schema: ref('ValueSchema'), typeRef: name };
const contract = (properties, required, constraints) => object(
  { ...properties, ...contractFields }, required, { ...choose('schema', 'typeRef'), ...constraints },
);
const safeInterval = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const querySettings = { refresh: bool, intervalMs: safeInterval };
const renderFields = {
  id: name, componentRef: name, component: ref('ComponentSpec'), inputs: ref('Inputs'), when: condition,
  slots: map(any(array(ref('ComponentNode')), ref('SlotPath'))),
  on: map(one(ref('ActionCall'), ref('EmitBinding'))),
};
const componentFields = { ports: ref('Ports'), slots: map(ref('SlotContract')), events: map(ref('TypeContract')) };
const screenFields = {
  ports: ref('Ports'), states: map(ref('StateDeclaration')), queries: map(ref('QueryUse')),
  queryDefaults: ref('QueryDefaults'), reactions: array(ref('Reaction')), render: ref('RenderRoot'),
};
const actionFields = { ports: ref('Ports') };
const envelope = (kind, spec) => object({ kind: literal(kind), id: name, name: str, spec }, ['kind', 'id', 'spec']);
const callStep = (kind, resource) => {
  const reference = resource.toLowerCase() + 'Ref';
  return object({ kind: literal(kind), id: name, [reference]: name, spec: ref(resource + 'Spec'), inputs: ref('Inputs') },
    ['kind'], choose(reference, 'spec'));
};
const httpMethods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const httpMap = (item, propertyNames = escapedName) => any(ref('HttpDynamicExpression'), {
  ...map(item), propertyNames,
});
// Mirror Core's HTTP header contract. JSON Schema patterns have no flags field.
const headerNameSyntax = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const headerValueSyntax = /^[\t\x20-\x7e\x80-\xff]*$/;
const reservedHeaderNames = [
  'accept-charset', 'accept-encoding', 'access-control-request-headers', 'access-control-request-method',
  'connection', 'content-length', 'cookie', 'cookie2', 'date', 'dnt', 'expect', 'host', 'keep-alive',
  'origin', 'referer', 'set-cookie', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'via',
  'user-agent', 'x-http-method', 'x-http-method-override', 'x-method-override',
];
const ignoreAsciiCase = token => token.replace(/[a-z]/g, char => `[${char}${char.toUpperCase()}]`);
const reservedHeaderPattern = `^(?:(?:${reservedHeaderNames.map(ignoreAsciiCase).join('|')})$|${['proxy-', 'sec-'].map(ignoreAsciiCase).join('|')})`;
const headerValue = any({ ...str, pattern: headerValueSyntax.source }, literal(null), ref('HttpDynamicExpression'));
const paramValue = any({ type: ['string', 'number', 'boolean'] }, ref('HttpDynamicExpression'));
const keys = ['null', 'boolean', 'object', 'array', 'number', 'integer', 'string'];
const nativeKinds = ['set', 'map', 'date', 'time', 'datetime'];
const draftProfile = ref('ValueSchema');
const schemaGroup = array(draftProfile, { minItems: 1 });
const localRef = { ...str, pattern: '^#/' };
const hasNativeKind = kind => ({ properties: { 'x-viewstem-type': literal(kind) }, required: ['x-viewstem-type'] });

const definitions = {
  View: envelope('View', ref('ViewSpec')),
  Component: envelope('Component', one(ref('ComponentSpec'), ref('ComponentContract'))),
  Variable: envelope('Variable', ref('VariableSpec')),
  Query: envelope('Query', ref('QuerySpec')),
  Datasource: envelope('Datasource', ref('DatasourceSpec')),
  Action: envelope('Action', one(ref('ActionSpec'), ref('CodeActionSpec'))),
  Type: envelope('Type', object({ schema: draftProfile }, ['schema'])),
  ViewSpec: object(screenFields, ['render']),
  ComponentSpec: object({ ...screenFields, ...componentFields }, ['render']),
  ComponentContract: {
    title: 'Host Component contract',
    description: 'Register with registry.registerComponentContract and supply a separate renderer implementation.',
    ...object(componentFields),
  },
  RenderRoot: object(renderFields, ['id'], choose('componentRef', 'component')),
  ComponentNode: object({ ...renderFields, repeat: ref('Repeat') }, ['id'], choose('componentRef', 'component')),
  Repeat: object({
    items: any(array(value), ref('DynamicExpression')), as: name,
    key: any(str, num, ref('DynamicExpression')),
  }, ['items', 'as', 'key']),
  SlotContract: object({ required: bool }),
  SlotPath: directPath('slots'),
  EmitBinding: object({ emit: name, payload: value }, ['emit', 'payload']),
  ActionCall: object({ id: name, actionRef: name, action: ref('ActionSpec'), inputs: ref('Inputs') }, [], choose('actionRef', 'action')),
  TypeContract: contract({}),
  ValuePort: contract({ kind: literal('Value'), required: bool, default: {} }, ['kind'], {
    not: { required: ['required', 'default'], properties: { required: literal(true) } },
  }),
  StatePort: contract({ kind: literal('State'), required: bool }, ['kind']),
  QueryPort: object({ kind: literal('Query'), required: bool }, ['kind']),
  Ports: map(one(ref('ValuePort'), ref('StatePort'), ref('QueryPort'))),
  ValuePorts: map(ref('ValuePort')),
  StateDeclaration: one(ref('State'), ref('Derived')),
  State: contract({ kind: literal('State'), initial: value }, ['kind']),
  Derived: {
    ...contract({ kind: literal('Derived'), variableRef: name, variable: ref('VariableSpec'), inputs: ref('Inputs') }, ['kind']),
    allOf: [choose('variableRef', 'variable')],
  },
  Reaction: object({ watch: array(directPath('ports|states'), { minItems: 1 }), target: directPath('ports|states'), value: {} },
    ['watch', 'target', 'value']),
  VariableSpec: object({ ports: ref('ValuePorts'), expression: name }, ['expression']),
  QuerySpec: object({ ports: ref('ValuePorts'), sources: map(ref('QuerySource')), transform: ref('Transform') }, ['sources', 'transform']),
  QuerySource: one(ref('ReferencedQuerySource'), ref('InlineQuerySource'), ref('ReferencedHttpSource'), ref('InlineHttpSource')),
  ReferencedQuerySource: object({ queryRef: name, inputs: ref('Inputs') }, ['queryRef']),
  InlineQuerySource: object({ query: ref('QuerySpec'), inputs: ref('Inputs') }, ['query']),
  ReferencedHttpSource: object({ datasourceRef: name, request: ref('HttpRequest') }, ['datasourceRef', 'request']),
  InlineHttpSource: object({ datasource: ref('DatasourceSpec'), request: ref('HttpRequest') }, ['datasource', 'request']),
  QueryUse: object({
    queryRef: name, query: ref('QuerySpec'), inputs: ref('Inputs'), ...querySettings,
    executeWhen: condition, autoRefreshWhen: condition,
  }, [], choose('queryRef', 'query')),
  QueryDefaults: object(querySettings),
  Transform: object({ input: value, steps: array(one(ref('Concat'), ref('Join'))) }, ['input']),
  Concat: object({ kind: literal('Concat'), with: array(any(array(value), ref('DynamicExpression'))) }, ['kind', 'with']),
  Join: object({
    kind: literal('Join'), right: any(array(value), ref('DynamicExpression')),
    mode: { enum: ['left', 'right', 'inner'], default: 'left' },
    on: array(object({ left: str, right: str }, ['left', 'right']), { minItems: 1 }),
  }, ['kind', 'right', 'on']),
  DatasourceSpec: object({
    kind: literal('Http'), baseUrl: ref('HttpStringExpression'), headers: ref('HttpHeaders'), params: ref('HttpParams'),
    secrets: map(name), auth: ref('Login'),
  }, ['kind', 'baseUrl']),
  Login: object({
    kind: literal('Login'), request: any(ref('HttpRequest'), ref('HttpDynamicExpression')), token: ref('HttpStringExpression'),
  }, ['kind', 'request', 'token']),
  HttpRequest: object({
    method: any({ enum: httpMethods }, ref('HttpDynamicExpression')),
    path: ref('HttpStringExpression'), baseUrl: ref('HttpStringExpression'),
    headers: ref('HttpHeaders'), params: ref('HttpParams'), body: ref('HttpValueExpression'),
  }, ['method', 'path'], {
    if: { properties: { method: { enum: ['GET', 'HEAD'] } }, required: ['method'] }, then: { not: { required: ['body'] } },
  }),
  HttpHeaders: {
    description: 'Header names are case-insensitive. Core also checks for duplicate names that differ only in case and validates evaluated headers.',
    ...httpMap(headerValue, { pattern: headerNameSyntax.source, not: { pattern: reservedHeaderPattern } }),
  },
  HttpParams: httpMap(any(paramValue, literal(null), array(paramValue))),
  ActionSpec: object({ ...actionFields, steps: array(ref('ActionStep')), output: contract({ value }, ['value']) }, ['steps']),
  CodeActionSpec: {
    title: 'Host Action contract',
    description: 'Register with registry.registerAction and supply a handler. A declared output is a type contract.',
    ...object({ ...actionFields, output: ref('TypeContract') }),
  },
  ActionStep: one(ref('ActionInvoke'), ref('ActionQuery'), ref('ActionVariable'), ref('SetState'), ref('RefreshQuery'), ref('If'), ref('Assert')),
  ActionInvoke: callStep('Action', 'Action'),
  ActionQuery: callStep('Query', 'Query'),
  ActionVariable: callStep('Variable', 'Variable'),
  SetState: object({ kind: literal('SetState'), id: name, target: directPath('ports'), value }, ['kind', 'target', 'value']),
  RefreshQuery: object({ kind: literal('RefreshQuery'), id: name, target: directPath('ports') }, ['kind', 'target']),
  If: object({ kind: literal('If'), id: name, condition, then: array(ref('ActionStep')), else: array(ref('ActionStep')) }, ['kind', 'condition', 'then']),
  Assert: object({ kind: literal('Assert'), id: name, condition, message: ref('StringExpression') }, ['kind', 'condition']),
  Inputs: {
    description: 'A map of named inputs or an expression yielding the entire input object. Use explicit direct bindings for State and Query handles.',
    ...any({ ...expressions, propertyNames: escapedName }, ref('DynamicExpression')),
  },
  Pointer: { ...str, pattern: pathPattern },
  Path: object({ '@path': ref('Pointer') }, ['@path']),
  ValueExpression: any(
    { type: ['null', 'boolean', 'number', 'string'] }, array(value),
    { ...expressions, propertyNames: escapedName }, ref('DynamicExpression'),
  ),
  DynamicExpression: one(ref('Path'), ref('ValueCall')),
  ValueCall: one(
    object({ '@call': literal('concat'), args: array(ref('StringExpression')) }, ['@call', 'args']),
    object({ '@call': literal('formatString'), args: object({ value: ref('StringExpression') }, ['value']) }, ['@call', 'args']),
    object({ '@call': { ...name, not: { enum: ['concat', 'formatString'] } }, args: array(value) }, ['@call', 'args']),
  ),
  StringExpression: any(str, ref('DynamicExpression')),
  BooleanExpression: any(bool, ref('DynamicExpression')),
  HttpValueExpression: any(
    { type: ['null', 'boolean', 'number', 'string'] }, array(ref('HttpValueExpression')),
    { ...map(ref('HttpValueExpression')), propertyNames: escapedName }, ref('HttpDynamicExpression'),
  ),
  HttpDynamicExpression: one(
    ref('Path'),
    object({ '@call': literal('concat'), args: array(ref('HttpStringExpression')) }, ['@call', 'args']),
    object({ '@call': literal('formatString'), args: object({ value: ref('HttpStringExpression') }, ['value']) }, ['@call', 'args']),
  ),
  HttpStringExpression: any(str, ref('HttpDynamicExpression')),
  ValueSchema: any(bool, object({
    $schema: literal(draft), $ref: localRef, $defs: map(draftProfile),
    type: any({ enum: keys }, array({ enum: keys }, { minItems: 1, uniqueItems: true })),
    enum: array({}), const: {},
    allOf: schemaGroup, anyOf: schemaGroup, oneOf: schemaGroup, not: draftProfile,
    if: draftProfile, then: draftProfile, else: draftProfile,
    minimum: num, maximum: num, exclusiveMinimum: num, exclusiveMaximum: num,
    minLength: nonnegative, maxLength: nonnegative, pattern: str,
    properties: map(draftProfile), required: array(str, { uniqueItems: true }), additionalProperties: draftProfile,
    minProperties: nonnegative, maxProperties: nonnegative,
    items: draftProfile, prefixItems: schemaGroup, minItems: nonnegative, maxItems: nonnegative, uniqueItems: bool,
    title: str, description: str, default: {}, examples: array({}), readOnly: bool, writeOnly: bool,
    deprecated: bool, $comment: str,
    'x-viewstem-type': { enum: nativeKinds }, keys: draftProfile, values: draftProfile,
  }, [], {
    allOf: [
      { not: { required: ['x-viewstem-type', 'type'] } },
      { if: hasNativeKind('set'), then: { required: ['items'] } },
      { if: hasNativeKind('map'), then: { required: ['keys', 'values'] },
        else: { not: any({ required: ['keys'] }, { required: ['values'] }) } },
    ],
  })),
};
export const resourceSchemaAnchor = kind => kind.toLowerCase() + '-json-schema';
export const resourceSchemaUrl = kind => '/schemas/viewstem/' + kind.toLowerCase() + '.json';

export function resourceSchema(kind) {
  if (!resourceKinds.includes(kind)) throw new Error('Unknown resource kind: ' + kind);
  const required = new Set();
  function collect(value) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string') {
      const key = value.$ref.slice('#/$defs/'.length);
      if (!required.has(key)) {
        required.add(key);
        if (!Object.hasOwn(definitions, key)) throw new Error('Unknown schema definition: ' + key);
        collect(definitions[key]);
      }
    }
    for (const child of Object.values(value)) collect(child);
  }
  const root = ref(kind);
  collect(root);
  return {
    $schema: draft,
    title: 'Viewstem ' + kind + ' resource',
    description: 'Structural JSON reference. Core also validates registry references, scope, types, and runtime behavior.',
    ...root,
    $defs: Object.fromEntries(Object.entries(definitions).filter(([key]) => required.has(key))),
  };
}

export const resourceSchemaJson = kind => JSON.stringify(resourceSchema(kind), null, 2) + '\n';
