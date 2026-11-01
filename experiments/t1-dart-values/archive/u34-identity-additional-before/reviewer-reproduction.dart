import 'dart:convert';
import '/Users/minholim/dev/minh/viewstem/experiments/t1-dart-values/bin/probe.dart' as p;
void main() {
  for (final itemSchema in [
    {'type':'array','items':{'type':'integer'}},
    {'type':'object','properties':{'a':{'type':'array','items':{'type':'integer'}}},'additionalProperties':false},
    {'type':'object','properties':{'a':{'x-viewstem-type':'datetime'}},'additionalProperties':false},
  ]) {
    final schema={'x-viewstem-type':'set','items':itemSchema};
    final item = itemSchema['type']=='array' ? [1] : p.DataObject({'a': ((itemSchema['properties'] as Map)['a'] as Map)['type']=='array' ? [1] : '2026-10-29T00:00:00.000Z'});
    final cell=p.Cell(schema,status:'ready',initial:{item});
    final old=cell.read() as Set, member=old.first;
    cell.write({...old});
    final next=cell.read() as Set;
    print(jsonEncode({'kind':itemSchema,'sameMember':identical(member,next.first),'keptSnapshot':identical(old,next),'equal':p.equal(old,next),'newSetHasOldMember':next.contains(member)}));
  }
  final schema={'type':'object','additionalProperties':{'type':'integer'}};
  print(jsonEncode({'typedAdditionalProperties':p.encode(p.admit(schema,p.DataObject({'bad':'text'})))}));
}
