#!/usr/bin/env python3
"""Prove di concorrenza sull'invito irrigidito (blocco W2).

Due generazioni simultanee dello stesso utente devono lasciare UN SOLO token
attivo: il controllo nella funzione SQL non basta da solo, perche' due
transazioni lo superano entrambe. Il vincolo che regge e' l'indice unico
parziale su (user_id) WHERE stato='attivo'.

    API=http://localhost:3010/api DB_CONTAINER=pn-w2-db python3 scripts/smoke/w2-concorrenza.py
"""
import json
import os
import subprocess
import uuid
from concurrent.futures import ThreadPoolExecutor
from urllib import error, request

API = os.environ.get('API', 'http://localhost:3001/api')
DB_CONTAINER = os.environ.get('DB_CONTAINER', 'prima_nota_db')
DB_NAME = os.environ.get('DB_NAME', 'prima_nota')

PASS = 0
FAIL = 0


def ok(desc):
    global PASS
    PASS += 1
    print(f'  OK    {desc}')


def ko(desc, atteso, ottenuto):
    global FAIL
    FAIL += 1
    print(f'  FAIL  {desc}\n         atteso={atteso} ottenuto={ottenuto}')


def eq(desc, atteso, ottenuto):
    ok(desc) if atteso == ottenuto else ko(desc, atteso, ottenuto)


def call(method, path, body=None, token=None):
    data = None if body is None else json.dumps(body).encode()
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = request.Request(API + path, data=data, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}


def psql(sql):
    out = subprocess.run(
        ['docker', 'exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', DB_NAME, '-tA', '-c', sql],
        capture_output=True, text=True)
    return out.stdout.strip()


sfx = uuid.uuid4().hex[:8]
_, u = call('POST', '/auth/register', {
    'username': 'w2c' + sfx, 'email': f'w2c{sfx}@t.it', 'password': 'Password123!'})
ut = u['token']
_, prof = call('GET', '/auth/profile', token=ut)
uid = prof['id']

print('=== generazione concorrente di due token ===')
with ThreadPoolExecutor(max_workers=2) as ex:
    futures = [ex.submit(call, 'POST', '/utenti/genera-token-invito', {}, ut) for _ in range(2)]
    risposte = [f.result() for f in futures]

codici = sorted(r[0] for r in risposte)
attivi = psql(f"SELECT count(*) FROM token_inviti WHERE user_id={uid} AND stato='attivo';")
righe = psql(f"SELECT count(*) FROM token_inviti WHERE user_id={uid};")
print(f'  risposte={codici} token attivi={attivi} righe totali={righe}')

eq('una sola generazione riesce', [200, 409], codici)
eq('resta un solo token attivo', '1', attivi)
eq('nessuna riga spuria in tabella', '1', righe)

# Il token della risposta andata a buon fine deve essere quello in tabella.
vincente = next((r[1].get('token') for r in risposte if r[0] == 200), None)
corrisponde = psql(
    "SELECT count(*) FROM token_inviti "
    f"WHERE user_id={uid} AND stato='attivo' "
    f"AND token_hash = encode(sha256(convert_to('{vincente}','UTF8')),'hex');")
eq('il token restituito e\' quello memorizzato come hash', '1', corrisponde)

print()
print('================================================')
print(f'PASS {PASS}   FAIL {FAIL}')
raise SystemExit(0 if FAIL == 0 else 1)
