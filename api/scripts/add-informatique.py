#!/usr/bin/env python3
"""Prepare a reviewable, idempotent planning update; never writes to production."""
import argparse
import copy
from datetime import date
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def prepare(original, additions):
    data = copy.deepcopy(original)
    for group in additions['groups']:
        existing = next((g for g in data['groups'] if g['id'] == group['id']), None)
        if existing is not None and existing != group:
            raise ValueError('A recomposed group identifier is already used differently')
        if existing is None:
            data['groups'].append(group)
    if len(additions['sessions']) != 16 or len({s['group'] for s in additions['sessions']}) != 16:
        raise ValueError('The source must contain sixteen distinct group sessions')
    for session in additions['sessions']:
        indices = [i for i, w in enumerate(data['weeks']) if w['start'] <= session['date'] <= w['end']]
        if len(indices) != 1 or date.fromisoformat(session['date']).weekday() != 0:
            raise ValueError('Source date does not match exactly one Monday/week')
        if session['group'] not in {g['id'] for g in data['groups']}:
            raise ValueError('Unknown group')
        index = indices[0]
        matches = [s for s in data['slots'] if s['subject'] == 'informatique'
                   and s['group_by_week'][index] == session['group']]
        if matches:
            if len(matches) == 1 and all(matches[0][k] == v for k, v in
                    {'day': 'lundi', 'start': session['start'], 'end': session['end']}.items()):
                continue
            raise ValueError('An existing informatics session differs from the source')
        for slot in data['slots']:
            if (slot['day'] == 'lundi' and slot['start'] < session['end']
                    and slot['end'] > session['start']
                    and slot['group_by_week'][index] == session['group']):
                raise ValueError('A group already has a session during this hour')
        allocation = [None] * len(data['weeks'])
        allocation[index] = session['group']
        data['slots'].append({'subject': 'informatique', 'examiner': additions['examiner'],
                             'day': 'lundi', 'start': session['start'], 'end': session['end'],
                             'room': additions['room'], 'group_by_week': allocation})
    assert data['slots'][:len(original['slots'])] == original['slots']
    assert data['groups'][:len(original['groups'])] == original['groups']
    assert {k:v for k,v in data.items() if k not in ('groups','slots')} == {
        k:v for k,v in original.items() if k not in ('groups','slots')}
    return data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('snapshot', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    snapshot = json.loads(args.snapshot.read_text())
    additions = json.loads((ROOT / 'data/informatique-s1-2026-2027.json').read_text())
    original = snapshot['data']
    data = prepare(original, additions)
    assert prepare(data, additions) == data
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'added_sessions': len(data['slots']) - len(original['slots']),
                      'added_groups': len(data['groups']) - len(original['groups']),
                      'existing_data_preserved': True, 'idempotent': True}))


if __name__ == '__main__':
    main()
