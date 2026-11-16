---
title: State
description: Keep values in a View and change them explicitly.
---

A screen needs to remember values such as a draft title, a selection, or an enabled setting. **State** stores these values for a running View or Component. Expressions that read State observe its changes.

## Declare and read State

This complete View starts with a title of **Draft**.


```json
{
  "states": {
    "title": {
      "kind": "State",
      "schema": {
        "type": "string"
      },
      "initial": "Draft"
    }
  },
  "render": {
    "id": "title",
    "componentRef": "shadcn.Badge",
    "inputs": {
      "text": {
        "@path": "/states/title"
      }
    }
  }
}
```


`states` is a map of local names to declarations. `kind: "State"` creates a writable value, `schema` defines its type, and `initial` supplies its starting value. The badge reads it through `/states/title`.

## Change the value

After mounting this View as `mounted`, the host can write through its State handle:


```js
view.getState('title').write('Saved');
```


The badge changes to **Saved**. The new value is validated before it is applied. A number would fail this string schema. A write replaces the whole State value; writing an object does not implicitly merge its properties.

A UI event can perform the same change with an Action’s `SetState` step. That Action must receive the target through a State port. You will connect the event and Action on the Events and Actions page.

## Initial values are not live bindings

`initial` can read an input expression. Once initialized, State keeps its value until an explicit write; later input changes do not continually overwrite it. Use Derived when the value should always follow a calculation.

Without a ready initial value or an explicit write, State is missing. Missing is different from an intentional `null`, an empty string, or an empty array.

## State belongs to an instance

Two instances of the same Component get separate local State. To share a value, connect both through State ports to a State owned by their parent. Removing an instance ends the lifetime of its local State; mounting it again creates a new instance.

State changes are runtime changes. Saving them to a database is the host application’s responsibility.

Try the [State example](../../../examples/state/) to inspect the initial value and its rendered output.
