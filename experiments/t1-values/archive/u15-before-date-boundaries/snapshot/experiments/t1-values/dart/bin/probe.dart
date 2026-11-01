import 'dart:convert';
import 'dart:io';
import 'package:cel/cel.dart';

dynamic decode(Map<String, dynamic> v) => switch (v['type']) {
  'int' => int.parse(v['value'] as String),
  'double' => (v['value'] as num).toDouble(),
  'list' => (v['value'] as List).map((x) => decode(x)).toList(),
  'object' => (v['value'] as Map<String, dynamic>).map(
    (k, v) => MapEntry(k, decode(v)),
  ),
  'map' => Map.fromEntries(
    (v['value'] as List).map((x) => MapEntry(decode(x[0]), decode(x[1]))),
  ),
  _ => v['value'],
};

Map<String, dynamic> encode(dynamic v) {
  if (v == null) return {'type': 'null'};
  if (v is bool) return {'type': 'bool', 'value': v};
  if (v is int) return {'type': 'int', 'value': v.toString()};
  if (v is double)
    return {'type': 'double', 'value': v.isFinite ? v : v.toString()};
  if (v is String) return {'type': 'string', 'value': v};
  if (v is List) return {'type': 'list', 'value': v.map(encode).toList()};
  return {'type': 'unsupported', 'name': v.runtimeType.toString()};
}

void main(List<String> args) {
  final fixtures = jsonDecode(File(args[0]).readAsStringSync()) as List;
  final rows = <Map<String, dynamic>>[];
  for (final f in fixtures) {
    Map<String, dynamic> actual;
    String? detail;
    try {
      final e = Environment.standard();
      final p = e.makeProgram(e.compile(f['expression'] as String));
      final ctx = (f['bindings'] as Map<String, dynamic>).map(
        (k, v) => MapEntry(k, decode(v)),
      );
      actual = encode(p.evaluate(ctx));
    } catch (error) {
      actual = {'type': 'error'};
      final text = error.toString();
      detail = text.length <= 300 ? text : text.substring(0, 300);
    }
    rows.add({
      'group': 'cel',
      'id': 'dart/${f['id']}',
      'expected': f['expected'],
      'actual': actual,
      'expression': f['expression'],
      if (detail != null) 'detail': detail,
    });
  }
  File(args[1]).writeAsStringSync(
    '${const JsonEncoder.withIndent('  ').convert({'runtime': Platform.version.split(' on ').first, 'package': 'cel 0.6.1', 'rows': rows})}\n',
  );
  stdout.writeln('Dart CEL: ${rows.length} fixtures executed');
}
