// Authoring only: these helpers expand into ordinary ViewSpec JSON. Field edits
// explicitly rebuild an object and SetState replaces the whole State value.
export const path = value => ({ '@path': value });
export const read = name => path('/states/' + name);
export const string = { type: 'string' };
export const boolean = { type: 'boolean' };
export const number = { type: 'number' };
export const choice = (...values) => ({ type: 'string', enum: values });
export const array = items => ({ type: 'array', items });
export const record = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
export const state = (initial, schema) => ({ kind: 'State', schema, initial });
export const derived = (inputs, expression, schema) => ({
  kind: 'Derived', schema,
  variable: { ports: Object.fromEntries(Object.keys(inputs).map(key => [key, { kind: 'Value', schema: true, required: true }])), expression }, inputs,
});

export function stateWriter(states) {
  return values => {
    const ports = {}, inputs = {}, groups = new Map();
    Object.entries(values).forEach(([address, value], index) => {
      const [name, ...fields] = address.split('/');
      const declaration = states[name];
      if (declaration?.kind !== 'State') throw Error(`Not a writable example State: ${name}`);
      let schema = declaration.schema;
      for (const field of fields) {
        if (!Object.hasOwn(schema.properties ?? {}, field)) throw Error(`Unknown example field: ${address}`);
        schema = schema.properties[field];
      }
      const valuePort = 'value' + index;
      ports[name] = { kind: 'State', schema: declaration.schema, required: true };
      inputs[name] = read(name);
      ports[valuePort] = { kind: 'Value', schema, required: true };
      inputs[valuePort] = value;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push({ fields, value: path('/ports/' + valuePort) });
    });
    function replacement(schema, location, edits) {
      const whole = edits.find(edit => edit.fields.length === 0);
      if (whole) {
        if (edits.length !== 1) throw Error('An example write cannot replace a parent and its child together');
        return whole.value;
      }
      // Example forms use closed records with all fields present. Untouched
      // branches read the current State port, preserving sibling input values.
      return Object.fromEntries(Object.entries(schema.properties).map(([key, child]) => {
        const nested = edits.filter(edit => edit.fields[0] === key).map(edit => ({ ...edit, fields: edit.fields.slice(1) }));
        const pointer = location + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1');
        return [key, nested.length ? replacement(child, pointer, nested) : path(pointer)];
      }));
    }
    const steps = [...groups].map(([name, edits]) => ({
      kind: 'SetState', target: path('/ports/' + name),
      value: replacement(states[name].schema, '/ports/' + name, edits),
    }));
    return { action: { ports, steps }, inputs };
  };
}
