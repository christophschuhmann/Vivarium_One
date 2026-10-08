"""Pure Open Sims adapter: JSON lines in/out; no DB, network or provider credentials."""
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'vendor' / 'open-sims'))
from living_world import psychology, careers, affect
from living_world.rules import RuleRegistry
from living_world.daily_life import JOB_STATIONS
import romance_policy

registry = RuleRegistry()
def handle(request):
    op = request['op']
    if op == 'catalog':
        return {'actions': registry.actions, 'rates': registry.rates,
                'manifest': registry.manifest(), 'social': {**psychology.social_category_definitions(), **romance_policy.DEFINITIONS}, 'jobStations': {**JOB_STATIONS, 'Student': ['desk']}}
    if op == 'initialize':
        people = request['people']
        for person in people:
            person['psychology'] = psychology.initialize_psychology(person, random.Random(str(request['seed']) + ':' + person.get('seed_key', person['id'])))
            person['career'] = careers.initial(person)
        groups = {}
        for person in people:
            groups.setdefault(person['household_id'], []).append(person)
        for group in groups.values():
            patches = psychology.initialize_social_graph(group)
            for person in group:
                person['relations'] = patches[person['id']]['relations']
        return people
    if op == 'social':
        results = []
        for pair in request['pairs']:
            a, b = pair['a'], pair['b']
            candidates = psychology.social_candidates(a, b, request['now'])
            candidates += romance_policy.candidates(a, b, pair.get('venue', {}))
            category = pair.get('category')
            rng = random.Random(str(pair['seed']))
            possible = [c for c in candidates if c['allowed'] and (c['category'] != 'phone_call' or pair.get('remote')) and (not category or c['category'] == category)]
            # A shared school is not an adult workplace. Preschool interactions
            # use concrete play/care bids, not abstract negotiation or rivalry.
            if min(a.get('age', 0), b.get('age', 0)) < 18:
                possible = [c for c in possible if c['category'] != 'coordinate_work']
            if min(a.get('age', 0), b.get('age', 0)) < 6:
                simple = {'greet','small_talk','play_together','share_interest','offer_help','ask_help','comfort','check_in','tell_story','tell_joke','compliment','set_boundary','apologize','reconcile','celebrate','invite_activity'}
                possible = [c for c in possible if c['category'] in simple]
            # Adult partner preferences gate romance; friendship is unaffected.
            # All original age, kinship, privacy and consent checks still apply.
            def preference_allows(x, y):
                genders = x.get('profile', {}).get('romanticPreferences', {}).get('genders')
                return genders is None or y.get('gender') in genders
            if a.get('age', 0) >= 18 and b.get('age', 0) >= 18 and not (preference_allows(a, b) and preference_allows(b, a)):
                possible = [c for c in possible if c.get('tone') != 'romance' and c['category'] not in {'flirt', 'ask_date', 'express_affection', 'adult_private_intimacy'}]
            # Include variation instead of deterministically picking the same top category.
            if not possible:
                results.append({'allowed': False}); continue
            # Personal wishes and existing tensions shape the encounter, while
            # Open Sims remains responsible for feasibility and consent.
            motive = a.get('profile', {}).get('social', {}).get('motive')
            tension = float(a.get('relations', {}).get(b['id'], {}).get('tension', 0))
            favored = {'belonging': {'check_in', 'small_talk', 'invite_activity'},
                       'care': {'offer_help', 'comfort', 'check_in'},
                       'recognition': {'share_interest', 'confide', 'collaborate_project'},
                       'stability': {'check_in', 'reconcile', 'deep_talk'},
                       'independence': {'set_boundary', 'share_interest'},
                       'curiosity': {'ask_advice', 'share_interest', 'play_together'}}.get(motive, set())
            def weight(candidate):
                score = candidate['score'] + max(-.2, min(.2, float(a.get('expectation_bias', {}).get(b['id'], {}).get(candidate['category'], 0)))) + (.18 if candidate['category'] in favored else 0)
                if candidate.get('tone') == 'romance' or candidate['category'] in {'flirt','ask_date','express_affection'}:
                    score += min(.3, float(a.get('needs', {}).get('romantic_affection', 0)) * .3)
                motivation = a.get('social_motivations', {})
                if motivation.get('sharedGoals') and candidate['category'] in {'collaborate_project', 'coordinate_work', 'make_plans', 'share_interest', 'offer_help', 'ask_help'}:
                    score += .10 + .24 * float(motivation.get('prosociality', .5))
                if candidate['category'] in {'challenge', 'undermine', 'provoke'}:
                    score += min(.38, float(motivation.get('rivalry', 0)) * .55)
                if candidate.get('tone') == 'romance' and a.get('age', 0) >= 18 and b.get('age', 0) >= 18:
                    attraction = motivation.get('attraction')
                    score += max(-.35, (float(.5 if attraction is None else attraction)-.5) * .9)
                drives = motivation.get('drives', {})
                if candidate['category'] in {'ask_advice', 'ask_help', 'collaborate_project', 'coordinate_work'}:
                    score += (float(motivation.get('otherReputation', .5))-.5)*.45
                    score += float(drives.get('achievement', 0))*.16
                if candidate['category'] in {'small_talk', 'invite_activity', 'check_in'}:
                    score += float(drives.get('connection', 0))*.2
                if candidate['category'] in {'share_news', 'share_interest', 'tell_story', 'collaborate_project'}:
                    score += float(drives.get('recognition', 0))*.2
                if candidate['category'] in {'ask_advice', 'small_talk'}:
                    score += float(drives.get('recognition', 0))*float(motivation.get('otherRecognition', 0))*.16
                # Remembered hurt can invite repair, a boundary, or conflict;
                # disposition and strain determine the direction, not a drama coin.
                unresolved = float(motivation.get('unresolvedStrain', 0))
                if candidate['category'] in {'argue', 'provoke', 'undermine'}:
                    score += unresolved * (1-float(motivation.get('prosociality', .5))) * .7
                if candidate['category'] in {'reconcile','apologize','set_boundary'}:
                    score += unresolved * (.15+float(motivation.get('prosociality', .5))*.4)
                if tension > .035 and candidate['category'] in {'apologize', 'reconcile', 'set_boundary'}:
                    score += min(.35, tension * 1.5)
                return max(.01, score) ** 2
            weights = [weight(c) for c in possible]
            chosen = rng.choices(possible, weights=weights)[0]
            outcome = pair.get('outcome') or ('accepted' if rng.random() < chosen['willingness'] else 'declined')
            if chosen['requires_consent'] and pair.get('outcome') == 'accepted' and not pair.get('consent_checked') and rng.random() >= chosen['willingness']:
                outcome = 'declined'
            patch = (romance_policy.apply if chosen['category'] in romance_policy.DEFINITIONS else psychology.apply_social)(a, b, chosen['category'], outcome, request['now'], pair['eventId'])
            results.append({'allowed': True, 'category': chosen['category'], 'outcome': outcome, 'patch': patch,
                            'duration': chosen['duration_seconds'], 'consent': chosen['requires_consent']})
        return results
    if op == 'replay_social':
        people = {p['id']: p for p in request['people']}
        for event in request['events']:
            a, b = (people[id] for id in event['participants'])
            patch = (romance_policy.apply if event['category'] in romance_policy.DEFINITIONS else psychology.apply_social)(a, b, event['category'], event['outcome'], event['time'], event['id'])
            for id, change in patch.items():
                people[id].setdefault('relations', {}).update(change['relations'])
                other = b if id == a['id'] else a
                people[id].update(psychology.observe(people[id], other['id'], event['category']+' '+event['outcome'], event['time'], event['id']))
                known = people[id]['psychology']['theory_of_mind']['known_people']
                while len(known) > 24:
                    oldest = min(known, key=lambda k: known[k]['observations'][-1]['at'])
                    del known[oldest]
                people[id]['affect'] = affect.appraise(people[id], people[id]['needs'], event['time'], {'kind':'social', 'category':event['category'], 'outcome':event['outcome'], 'text':event['category']+' '+event['outcome']}, event['id'])
        return {id: {'relations':p['relations'], 'psychology':p['psychology'], 'affect':affect.project_affect(p, request['now'])} for id, p in people.items()}
    if op == 'careers':
        current, results = {}, []
        for p in request['people']:
            actor = {**p, **current.get(p['id'], {})}
            update = careers.complete_shift(actor, p['duration'], p['now'], p['eventId'], 0)
            current[p['id']] = update
            results.append(update)
        return results
    if op == 'bias':
        return [{kind: psychology.action_bias(p, kind, request['now']) for kind in request['kinds']} for p in request['people']]
    raise ValueError('Unknown adapter operation')

for line in sys.stdin:
    try:
        request = json.loads(line)
        print(json.dumps({'id': request['id'], 'result': handle(request)}, ensure_ascii=False), flush=True)
    except Exception as error:
        print(json.dumps({'id': request.get('id'), 'error': str(error)}), flush=True)
