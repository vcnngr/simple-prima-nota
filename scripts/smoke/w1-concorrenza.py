#!/usr/bin/env python3
"""Prove di concorrenza sul workflow di collegamento (blocco W1).

Due difetti segnalati in revisione non si vedono a richieste sequenziali:

  P0-4  le transizioni di stato erano check-then-update: `accetta` e `rifiuta`
        lanciate insieme rispondevano entrambe 200 e lo stato finale dipendeva
        dall'ordine di arrivo, riaprendo uno stato terminale;
  P0-5  `usa_token_invito` leggeva `usato` senza lock: lo stesso token monouso
        apriva due richieste di collegamento.

Per renderli deterministici lo script installa un trigger che dorme un secondo
prima dell'UPDATE, allargando la finestra di gara, lancia due richieste in
parallelo e poi rimuove il trigger. Contro il codice corretto una sola delle due
richieste deve riuscire.

    API=http://localhost:3009/api DB_CONTAINER=pn-w1-db python3 scripts/smoke/w1-concorrenza.py
"""

import json
import os
import subprocess
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from urllib import error, request

API = os.environ.get('API', 'http://localhost:3001/api')
DB_CONTAINER = os.environ.get('DB_CONTAINER', 'prima_nota_db')
DB_NAME = os.environ.get('DB_NAME', 'prima_nota')

esiti = []


def psql(sql):
    return subprocess.run(
        ['docker', 'exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', DB_NAME, '-tA', '-c', sql],
        capture_output=True, text=True,
    ).stdout.strip()


def call(method, path, body=None, token=None):
    data = None if body is None else json.dumps(body).encode()
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = request.Request(API + path, data=data, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b'{}')
    except error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b'{}')
        except Exception:
            return e.code, {}


def check(desc, atteso, ottenuto):
    buono = atteso == ottenuto
    esiti.append(buono)
    print(f"  {'OK   ' if buono else 'FAIL '} {desc}")
    if not buono:
        print(f"         atteso={atteso} ottenuto={ottenuto}")


def ritardo(tabella, colonna, attivo):
    """Installa (o rimuove) un trigger che dorme prima dell'UPDATE."""
    nome = f'pn_ritardo_{tabella}'
    if attivo:
        psql(
            f"CREATE OR REPLACE FUNCTION {nome}() RETURNS trigger LANGUAGE plpgsql AS "
            f"$$ BEGIN PERFORM pg_sleep(1); RETURN NEW; END $$;"
        )
        psql(f"DROP TRIGGER IF EXISTS {nome} ON {tabella};")
        psql(
            f"CREATE TRIGGER {nome} BEFORE UPDATE OF {colonna} ON {tabella} "
            f"FOR EACH ROW EXECUTE FUNCTION {nome}();"
        )
    else:
        psql(f"DROP TRIGGER IF EXISTS {nome} ON {tabella};")
        psql(f"DROP FUNCTION IF EXISTS {nome}();")


def nuovo_utente(sfx):
    _, u = call('POST', '/auth/register', {
        'username': 'race_u' + sfx, 'email': f'race_u{sfx}@t.it', 'password': 'Password123!'})
    return u['token']


def nuovo_commercialista(sfx):
    _, c = call('POST', '/commercialisti/register', {
        'username': 'race_c' + sfx, 'email': f'race_c{sfx}@t.it',
        'password': 'Password123!', 'ragione_sociale': 'Studio Race ' + sfx})
    return c['token']


# ----------------------------------------------------------------------------
# P0-4: accetta e rifiuta in parallelo sullo stesso collegamento
# ----------------------------------------------------------------------------
def prova_transizioni():
    print('\n=== P0-4: accetta + rifiuta concorrenti ===')
    sfx = uuid.uuid4().hex[:8]
    ut = nuovo_utente(sfx)
    ct = nuovo_commercialista(sfx)

    _, t = call('POST', '/utenti/genera-token-invito', {}, ut)
    call('POST', '/commercialisti/collega-cliente', {'token': t['token']}, ct)
    _, links = call('GET', '/utenti/collegamenti', token=ut)
    cid = links['collegamenti'][0]['id']

    ritardo('collegamenti_commercialista', 'stato', True)
    try:
        with ThreadPoolExecutor(max_workers=2) as ex:
            f1 = ex.submit(call, 'PUT', f'/utenti/collegamenti/{cid}/rifiuta', {'motivo': 'no'}, ut)
            time.sleep(0.05)  # garantisce che "rifiuta" entri per prima
            f2 = ex.submit(call, 'PUT', f'/utenti/collegamenti/{cid}/accetta', {}, ut)
            risultati = [f1.result(), f2.result()]
    finally:
        ritardo('collegamenti_commercialista', 'stato', False)

    codici = sorted(r[0] for r in risultati)
    finale = psql(f"SELECT stato FROM collegamenti_commercialista WHERE id={cid};")

    print(f'  risposte={codici} stato finale={finale}')
    check('una sola transizione riesce', [200, 409], codici)
    check('lo stato terminale non viene riaperto', 'rifiutata', finale)


# ----------------------------------------------------------------------------
# P0-5: stesso token presentato da due commercialisti in parallelo
# ----------------------------------------------------------------------------
def prova_token():
    print('\n=== P0-5: doppio uso concorrente del token ===')
    sfx = uuid.uuid4().hex[:8]
    ut = nuovo_utente('tok' + sfx)
    _, c1 = call('POST', '/commercialisti/register', {
        'username': 'race_t1' + sfx, 'email': f'race_t1{sfx}@t.it',
        'password': 'Password123!', 'ragione_sociale': 'Studio A'})
    _, c2 = call('POST', '/commercialisti/register', {
        'username': 'race_t2' + sfx, 'email': f'race_t2{sfx}@t.it',
        'password': 'Password123!', 'ragione_sociale': 'Studio B'})

    _, t = call('POST', '/utenti/genera-token-invito', {}, ut)
    tok = t['token']
    uid = psql(f"SELECT user_id FROM token_inviti WHERE token='{tok}';")

    ritardo('token_inviti', 'usato', True)
    try:
        with ThreadPoolExecutor(max_workers=2) as ex:
            futures = [
                ex.submit(call, 'POST', '/commercialisti/collega-cliente', {'token': tok}, c1['token']),
                ex.submit(call, 'POST', '/commercialisti/collega-cliente', {'token': tok}, c2['token']),
            ]
            risultati = [f.result() for f in futures]
    finally:
        ritardo('token_inviti', 'usato', False)

    codici = sorted(r[0] for r in risultati)
    creati = psql(f"SELECT count(*) FROM collegamenti_commercialista WHERE user_id={uid};")

    print(f'  risposte={codici} collegamenti creati={creati}')
    check('un solo commercialista consuma il token', [200, 400], codici)
    check('nasce un solo collegamento', '1', creati)


if __name__ == '__main__':
    prova_transizioni()
    prova_token()
    print('\n================================================')
    print(f'PASS {esiti.count(True)}   FAIL {esiti.count(False)}')
    sys.exit(0 if all(esiti) else 1)
