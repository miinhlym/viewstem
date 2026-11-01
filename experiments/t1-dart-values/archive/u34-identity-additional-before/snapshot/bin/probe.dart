// Independent VM host-value fixture model, not Dart core or a CEL engine.
import 'dart:collection';
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:timezone/data/latest.dart' as data;
import 'package:timezone/timezone.dart' as tz;

final undefined = Object(), hole = Object();
final known = HashSet<Object>.identity();
Never fail(String category) => throw FixtureError(category);

class FixtureError implements Exception {
  final String category;
  FixtureError(this.category);
}

// Distinguish JSON-like data objects from native Maps. Equality stays identity;
// fields are immutable only on stored copies, never on a caller's source.
class DataObject extends MapBase<String, dynamic> {
  final Map<String, dynamic> _fields;
  DataObject([Map<String, dynamic>? fields]) : _fields = fields ?? {};
  @override
  dynamic operator [](Object? key) => _fields[key];
  @override
  void operator []=(String key, dynamic value) => _fields[key] = value;
  @override
  void clear() => _fields.clear();
  @override
  Iterable<String> get keys => _fields.keys;
  @override
  dynamic remove(Object? key) => _fields.remove(key);
}

dynamic Function(dynamic) factory() {
  final refs = <String, dynamic>{};
  dynamic decode(dynamic value) {
    if (value is List) return value.map(decode).toList();
    if (value is! Map) return value;
    switch (value[r'$fixture']) {
      case 'undefined':
        return undefined;
      case 'hole':
        return hole; // Dart has no sparse list slot; private sentinel only.
      case 'negativeZero':
        return -0.0;
      case 'nan':
        return double.nan;
      case 'infinity':
        return double.infinity;
      case 'negativeInfinity':
        return double.negativeInfinity;
      case 'bigint':
        return BigInt.one;
      case 'function':
        return () => 1;
      case 'future':
        return Future.value(1);
      case 'dateObject':
        return DateTime.utc(2026, 10, 29);
      case 'symbol':
        return const Symbol('fixture');
      case 'sum':
        return (value['a'] as num).toDouble() + (value['b'] as num).toDouble();
      case 'ref':
        return refs[value['id']];
      case 'object':
        final object = DataObject();
        if (value.containsKey('id')) refs[value['id']] = object;
        (value['value'] as Map).forEach((key, child) {
          object[key] = decode(child);
        });
        return object;
      case 'set':
        return (value['values'] as List).map(decode).toSet();
      case 'map':
        return Map<dynamic, dynamic>.fromEntries(
          (value['entries'] as List).map(
            (entry) => MapEntry(decode(entry[0]), decode(entry[1])),
          ),
        );
      case 'cycle':
        switch (value['kind']) {
          case 'object':
            final object = DataObject();
            object['self'] = object;
            return object;
          case 'array':
            final array = <dynamic>[];
            array.add(array);
            return array;
          case 'set':
            final set = <dynamic>{};
            set.add(set);
            return set;
          default:
            final map = <dynamic, dynamic>{};
            map['self'] = map;
            return map;
        }
      default:
        return DataObject(
          Map<String, dynamic>.fromEntries(
            value.entries.map(
              (entry) => MapEntry(entry.key as String, decode(entry.value)),
            ),
          ),
        );
    }
  }

  return decode;
}

dynamic normalize(
  dynamic input, [
  Set<Object>? activeInput,
  Map<Object, dynamic>? copyInput,
]) {
  final active = activeInput ?? HashSet<Object>.identity(),
      copies = copyInput ?? HashMap<Object, dynamic>.identity();
  if (input == null || input is String || input is bool) return input;
  if (input is num) {
    final number = input.toDouble();
    if (!number.isFinite) fail('NON_FINITE');
    return number == 0 ? 0.0 : number;
  }
  if (identical(input, undefined) ||
      identical(input, hole) ||
      input is BigInt ||
      input is Function ||
      input is Future ||
      input is DateTime ||
      input is Symbol)
    fail('UNSUPPORTED_VALUE');
  if (input is! DataObject && input is! List && input is! Set && input is! Map)
    fail('UNSUPPORTED_VALUE');
  if (active.contains(input)) fail('CYCLIC_VALUE');
  if (known.contains(input)) return input;
  if (copies.containsKey(input)) return copies[input];
  active.add(input);
  dynamic output;
  if (input is DataObject) {
    output = DataObject();
    copies[input] = output;
    for (final key in input.keys)
      if (!identical(input[key], undefined))
        output[key] = normalize(input[key], active, copies);
  } else if (input is List) {
    output = <dynamic>[];
    copies[input] = output;
    for (final child in input) output.add(normalize(child, active, copies));
  } else if (input is Set) {
    output = <dynamic>{};
    copies[input] = output;
    for (final child in input) output.add(normalize(child, active, copies));
  } else {
    output = <dynamic, dynamic>{};
    copies[input] = output;
    (input as Map).forEach((key, child) {
      if (key is! String && key is! num) fail('MAP_KEY');
      output[normalize(key, active, copies)] = normalize(child, active, copies);
    });
  }
  active.remove(input);
  return output;
}

String dateValue(dynamic value, String kind) {
  if (value is! String) fail('DATE_INVALID');
  final datePattern = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');
  final timePattern = RegExp(
    r'^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,3}))?)?$',
  );
  DateTime date(String text) {
    final match = datePattern.firstMatch(text);
    if (match == null) fail('DATE_INVALID');
    final y = int.parse(match[1]!),
        m = int.parse(match[2]!),
        d = int.parse(match[3]!);
    if (y < 1 || y > 9999) fail('DATE_INVALID');
    final parsed = DateTime.utc(y, m, d);
    if (parsed.year != y || parsed.month != m || parsed.day != d)
      fail('DATE_INVALID'); // reject DateTime rollover
    return parsed;
  }

  String time(String text) {
    final match = timePattern.firstMatch(text);
    if (match == null) fail('DATE_INVALID');
    return '${match[1]}:${match[2]}:${match[3] ?? '00'}.${(match[4] ?? '').padRight(3, '0')}';
  }

  if (kind == 'date') {
    date(value);
    return value;
  }
  if (kind == 'time') return time(value);
  final match = RegExp(
    r'^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$',
  ).firstMatch(value);
  if (match == null || value.endsWith('-00:00')) fail('DATE_INVALID');
  final day = date(match[1]!),
      milliseconds = int.parse((match[5] ?? '').padRight(3, '0'));
  var parsed = DateTime.utc(
    day.year,
    day.month,
    day.day,
    int.parse(match[2]!),
    int.parse(match[3]!),
    int.parse(match[4]!),
    milliseconds,
  );
  final offset = match[6]!;
  if (offset != 'Z') {
    final minutes =
        int.parse(offset.substring(1, 3)) * 60 + int.parse(offset.substring(4));
    parsed = parsed.subtract(
      Duration(minutes: offset.startsWith('-') ? -minutes : minutes),
    );
  }
  if (parsed.year < 1 || parsed.year > 9999) fail('DATE_INVALID');
  return parsed.toIso8601String();
}

bool matchesType(dynamic value, String kind) => switch (kind) {
  'null' => value == null,
  'integer' =>
    value is num &&
        value.isFinite &&
        value.abs() <= 9007199254740991 &&
        value == value.truncateToDouble(),
  'number' => value is num && value.isFinite,
  'boolean' => value is bool,
  'string' => value is String,
  'object' => value is DataObject,
  'array' => value is List,
  _ => false,
};
dynamic applySchema(dynamic value, dynamic schema) {
  if (schema == true) return value;
  if (schema == false) fail('TYPE_MISMATCH');
  if (schema is! Map) fail('SCHEMA_OUTSIDE_FIXTURE');
  final allowed = {
    'type',
    'properties',
    'required',
    'additionalProperties',
    'items',
    'keys',
    'values',
    'anyOf',
    'x-viewstem-type',
  };
  if (schema.keys.any((key) => !allowed.contains(key)))
    fail('SCHEMA_OUTSIDE_FIXTURE');
  if (schema.containsKey('anyOf')) {
    final branches = schema['anyOf'] as List;
    if (branches.length != 2 ||
        branches.where((child) => child['type'] == 'null').length != 1)
      fail('SCHEMA_OUTSIDE_FIXTURE');
    if (value == null) return null;
    return applySchema(
      value,
      branches.firstWhere((child) => child['type'] != 'null'),
    );
  }
  if (schema.containsKey('type')) {
    final types = schema['type'] is List
        ? schema['type'] as List
        : [schema['type']];
    if (!types.any((type) => matchesType(value, type))) fail('TYPE_MISMATCH');
  }
  final native = schema['x-viewstem-type'];
  if (['date', 'time', 'datetime'].contains(native))
    return dateValue(value, native);
  if (native == 'set') {
    if (value is! Set) fail('TYPE_MISMATCH');
    final children = value
        .map((child) => applySchema(child, schema['items']))
        .toList();
    return children.indexed.every(
          (entry) => identical(entry.$2, value.elementAt(entry.$1)),
        )
        ? value
        : children.toSet();
  }
  if (native == 'map') {
    if (value is! Map || value is DataObject) fail('TYPE_MISMATCH');
    final result = <dynamic, dynamic>{};
    var changed = false;
    value.forEach((key, child) {
      final nextKey = applySchema(key, schema['keys']),
          next = applySchema(child, schema['values']);
      if (result.containsKey(nextKey)) fail('TYPE_MISMATCH');
      result[nextKey] = next;
      changed |= !identical(nextKey, key) || !identical(next, child);
    });
    return changed ? result : value;
  }
  if (value is DataObject) {
    final properties = schema['properties'] as Map? ?? {},
        required = schema['required'] as List? ?? [];
    if (required.any((key) => !value.containsKey(key))) fail('TYPE_MISMATCH');
    final output = DataObject();
    var changed = false;
    for (final key in value.keys) {
      if (!properties.containsKey(key) &&
          schema['additionalProperties'] == false)
        fail('TYPE_MISMATCH');
      final next = applySchema(value[key], properties[key] ?? true);
      output[key] = next;
      changed |= !identical(next, value[key]);
    }
    return changed ? output : value;
  }
  if (value is List && schema.containsKey('items'))
    return value.map((child) => applySchema(child, schema['items'])).toList();
  return value;
}

dynamic protect(dynamic input, [Map<Object, dynamic>? copyInput]) {
  if (input == null ||
      input is num ||
      input is bool ||
      input is String ||
      known.contains(input))
    return input;
  final copies = copyInput ?? HashMap<Object, dynamic>.identity();
  if (copies.containsKey(input)) return copies[input];
  dynamic result;
  if (input is DataObject)
    result = DataObject(
      Map<String, dynamic>.unmodifiable(
        input.map((key, child) => MapEntry(key, protect(child, copies))),
      ),
    );
  else if (input is List)
    result = List<dynamic>.unmodifiable(
      input.map((child) => protect(child, copies)),
    );
  else if (input is Set)
    result = Set<dynamic>.unmodifiable(
      input.map((child) => protect(child, copies)),
    );
  else if (input is Map)
    result = Map<dynamic, dynamic>.unmodifiable(
      input.map((key, child) => MapEntry(key, protect(child, copies))),
    );
  else
    fail('UNSUPPORTED_VALUE');
  copies[input] = result;
  known.add(result);
  return result;
}

dynamic admit(dynamic schema, dynamic input) =>
    protect(applySchema(normalize(input), schema));
bool equal(dynamic a, dynamic b) {
  if (identical(a, b)) return true;
  if (a is num && b is num) return a == b;
  if (a is Set && b is Set) return a.length == b.length && a.every(b.contains);
  if (a is List && b is List)
    return a.length == b.length &&
        a.indexed.every((entry) => equal(entry.$2, b[entry.$1]));
  if (a is DataObject && b is DataObject)
    return a.length == b.length &&
        a.keys.every((key) => b.containsKey(key) && equal(a[key], b[key]));
  if (a is Map && b is Map && a is! DataObject && b is! DataObject)
    return a.length == b.length &&
        a.keys.every((key) => b.containsKey(key) && equal(a[key], b[key]));
  return a == b;
}

dynamic encode(dynamic value) {
  if (value is DataObject) {
    final keys = value.keys.toList()..sort();
    return {for (final key in keys) key: encode(value[key])};
  }
  if (value is Set) return {r'$set': value.map(encode).toList()};
  if (value is Map)
    return {
      r'$map': value.entries
          .map((entry) => [encode(entry.key), encode(entry.value)])
          .toList(),
    };
  if (value is List) return value.map(encode).toList();
  return value;
}

Map<String, dynamic> ready(dynamic value) => {
  'status': 'ready',
  'value': encode(value),
};

class Cell {
  final dynamic schema;
  String status;
  dynamic value;
  String errorCategory = 'INTERNAL_ERROR';
  Cell(this.schema, {this.status = 'missing', dynamic initial}) {
    if (status == 'ready') value = admit(schema, initial);
  }
  factory Cell.initializing(dynamic schema, Future<dynamic> initial) {
    final cell = Cell(schema, status: 'pending');
    initial.then(
      (value) {
        try {
          cell.write(value);
        } catch (error) {
          cell.status = 'error';
          cell.errorCategory = error is FixtureError
              ? error.category
              : 'INTERNAL_ERROR';
        }
      },
      onError: (Object error) {
        cell.status = 'error';
        cell.errorCategory = error is FixtureError
            ? error.category
            : 'INTERNAL_ERROR';
      },
    );
    return cell;
  }
  dynamic read() {
    if (status == 'pending') fail('VALUE_PENDING');
    if (status == 'error') fail(errorCategory);
    return status == 'missing' ? undefined : value;
  }

  void write(dynamic next) {
    final accepted = admit(schema, next);
    if (status != 'ready' || !equal(value, accepted)) value = accepted;
    status = 'ready';
  }
}

String localInstant(String date, String time, String zone) {
  final day = dateValue(date, 'date'), clock = dateValue(time, 'time');
  final local = DateTime.parse(
    '${day}T${clock}Z',
  ); // validated civil components; UTC placeholder only
  final location = tz.getLocation(zone), matches = <DateTime>[];
  for (final offset
      in location.zones.map((zone) => zone.offset.inMilliseconds).toSet()) {
    final instant = local.subtract(Duration(milliseconds: offset)),
        roundtrip = tz.TZDateTime.from(instant, location);
    if (roundtrip.year == local.year &&
        roundtrip.month == local.month &&
        roundtrip.day == local.day &&
        roundtrip.hour == local.hour &&
        roundtrip.minute == local.minute &&
        roundtrip.second == local.second &&
        roundtrip.millisecond == local.millisecond)
      matches.add(instant);
  }
  if (matches.length != 1 ||
      matches.single.year < 1 ||
      matches.single.year > 9999)
    fail('DATE_INVALID');
  return dateValue(matches.single.toIso8601String(), 'datetime');
}

Future<dynamic> observe(Map<String, dynamic> fixture) async {
  final decode = factory();
  try {
    switch (fixture['op']) {
      case 'accept':
        return ready(admit(fixture['schema'], decode(fixture['input'])));
      case 'asyncResult':
        return ready(
          admit(
            fixture['schema'],
            await Future.value(decode(fixture['input'])),
          ),
        );
      case 'yy':
        final value = int.parse(fixture['input']);
        return value <= 68 ? value + 2000 : value + 1900;
      case 'timezone':
        return ready(
          localInstant(fixture['date'], fixture['time'], fixture['zone']),
        );
      case 'intResult':
        final value = admit({'type': 'integer'}, fixture['input']) as num;
        final internal =
            BigInt.from(value) +
            BigInt
                .one; // explicit private integer bridge, not general BigInt data
        if (internal.abs() > BigInt.from(9007199254740991))
          fail('TYPE_MISMATCH');
        return ready(admit({'type': 'integer'}, internal.toInt()));
      case 'adapterRoundtrip':
        return ready(admit(fixture['schema'], decode(fixture['input'])));
      case 'nativeEquality':
        final a = DataObject({'n': 1}), b = DataObject({'n': 1}), set = {a, b};
        return {
          'setObjects': set.length,
          'sameReference': set.contains(a),
          'sameContent': set.contains(DataObject({'n': 1})),
          'mapKeys': {
            1: 'int',
            1.0: 'double',
            '1': 'string',
            1.5: 'fraction',
          }.length,
        };
      case 'setIdentity':
        final schema = {
          'x-viewstem-type': 'set',
          'items': {'type': 'object'},
        };
        final cell = Cell(
              schema,
              status: 'ready',
              initial: {
                DataObject({'n': 1}),
                DataObject({'n': 1}),
              },
            ),
            set = cell.read() as Set;
        return {
          'size': set.length,
          'sameReference': set.contains(set.first),
          'sameContent': set.contains(DataObject({'n': 1})),
          'reorderedEqual': equal(
            set,
            admit(schema, set.toList().reversed.toSet()),
          ),
        };
      case 'mapIdentity':
        final map =
            admit(true, {
                  'null': null,
                  1.5: DataObject({'n': 1}),
                  '1.5': 3,
                })
                as Map;
        return {
          'reorderedEqual': equal(
            map,
            admit(true, Map.fromEntries(map.entries.toList().reversed)),
          ),
          'hasNull': map.containsKey('null'),
          'nullValue': map['null'],
          'hasAbsent': map.containsKey('absent'),
        };
      case 'zero':
        final value =
            admit(
                  true,
                  DataObject({
                    'n': -0.0,
                    's': {-0.0, 0.0},
                    'm': {-0.0: 1, '-0': 2},
                  }),
                )
                as DataObject;
        return {
          'negativeZero': (value['n'] as num).isNegative,
          'setSize': (value['s'] as Set).length,
          'mapSize': (value['m'] as Map).length,
        };
      case 'readonly':
        final source = DataObject({
          'o': DataObject({'n': 1}),
          'a': [
            DataObject({'n': 1}),
          ],
          's': {
            DataObject({'n': 1}),
          },
          'm': {
            'x': DataObject({'n': 1}),
          },
        });
        final cell = Cell(true, status: 'ready', initial: source),
            old = cell.read() as DataObject,
            stableRead = identical(cell.read(), old);
        source['o']['n'] = 8;
        source['a'].add(DataObject({'n': 2}));
        source['s'].clear();
        source['m'].clear();
        final sourceIsolated =
            old['o']['n'] == 1 &&
            old['a'].length == 1 &&
            old['s'].length == 1 &&
            old['m'].length == 1;
        final actions = <void Function()>[
          () {
            old['o']['n'] = 9;
          },
          () {
            old['a'].add(3);
          },
          () {
            old['s'].add(3);
          },
          () {
            old['s'].remove(old['s'].first);
          },
          () {
            old['m']['x'] = 3;
          },
          () {
            old['m'].clear();
          },
          () {
            old['m']['x']['n'] = 9;
          },
          () {
            old['a'][0]['n'] = 9;
          },
        ];
        var blocked = 0;
        for (final action in actions) {
          try {
            action();
          } catch (_) {
            blocked++;
          }
        }
        cell.write(DataObject({'next': true}));
        return {
          'sourceMutable': source['o']['n'] == 8,
          'sourceIsolated': sourceIsolated,
          'blockedMutations': blocked,
          'stableRead': stableRead,
          'oldSnapshotStable': old['o']['n'] == 1 && old['s'].length == 1,
        };
      case 'readiness':
      case 'prepare':
        final schema = {
          'type': ['integer', 'null'],
        };
        final cell = switch (fixture['state']) {
          'pending' => Cell.initializing(schema, Completer<dynamic>().future),
          'error' => Cell.initializing(
            schema,
            Future<dynamic>.error(FixtureError('TIMEOUT')),
          ),
          'ready' => Cell(schema, status: 'ready', initial: fixture['value']),
          _ => Cell(schema),
        };
        await Future<void>.delayed(Duration.zero);
        if (fixture['op'] == 'prepare') {
          if (cell.status == 'error') fail(cell.errorCategory);
          if (['missing', 'pending'].contains(cell.status)) {
            if (fixture['mode'] == 'explicit') fail('INPUT_NOT_READY');
            return {'status': 'waiting'};
          }
          return {'status': 'ready'};
        }
        final result = <String, dynamic>{'status': cell.status};
        if (cell.status == 'ready') result['value'] = encode(cell.value);
        try {
          final value = cell.read();
          result['simple'] = identical(value, undefined)
              ? 'missing'
              : encode(value);
        } on FixtureError catch (error) {
          result['simpleError'] = error.category;
        }
        return result;
      default:
        fail('UNKNOWN_OPERATION');
    }
  } on FixtureError catch (error) {
    return {'status': 'error', 'category': error.category};
  } on tz.LocationNotFoundException {
    return {'status': 'error', 'category': 'DATE_INVALID'};
  }
}

Future<void> main(List<String> args) async {
  data.initializeTimeZones();
  final fixtures =
          (jsonDecode(File(args[0]).readAsStringSync()) as Map)['cases']
              as List,
      rows = <Map<String, dynamic>>[];
  for (final fixture in fixtures) {
    try {
      rows.add({
        'id': fixture['id'],
        'actual': await observe(Map<String, dynamic>.from(fixture)),
      });
    } catch (error, stack) {
      rows.add({
        'id': fixture['id'],
        'actual': {'status': 'internal'},
        'unexpected': '$error',
        'stack': '$stack',
      });
    }
  }
  final result = {
    'runtime': Platform.version,
    'os': Platform.operatingSystem,
    'timezonePackage': '0.11.2',
    'nativeDateTimeParseRollsInvalidDay':
        DateTime.parse('2026-02-30').month == 3,
    'rows': rows,
  };
  File(args[1]).writeAsStringSync(
    '${const JsonEncoder.withIndent('  ').convert(result)}\n',
  );
  stdout.writeln(
    'Dart values: ${rows.length} actual host-value fixtures executed',
  );
}
