import argparse
import hashlib
import hmac
import os
import secrets
import time
from threading import RLock

from fastapi import HTTPException, Request, Response
from pydantic import BaseModel, Field

from app.storage import read, write

AUTH_LOCK = RLock()


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r'^[a-zA-Z0-9_.-]+$')
    password: str = Field(min_length=8, max_length=128)
    setup_token: str = Field('', max_length=200)


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()


def create_user(username, password, role='operator'):
    with AUTH_LOCK:
        users = read('users.json', {})
        if username in users:
            return
        salt = secrets.token_hex(16)
        users[username] = {'username': username, 'role': role, 'salt': salt, 'password_hash': password_hash(password, salt)}
        write('users.json', users)


def session_user(token):
    session = read('sessions.json', {}).get(token)
    if not session or session['expires'] < time.time():
        return None
    users = read('users.json', {})
    user = users.get(session['username'])
    return {'username': user['username'], 'role': user['role'], 'csrf': session['csrf']} if user else None


def require(request: Request, operator=False):
    user = session_user(request.cookies.get('conveyor_session', ''))
    if not user:
        raise HTTPException(401, 'Sign in to continue')
    if operator and user['role'] != 'operator':
        raise HTTPException(403, 'Operator access required')
    if request.method not in ('GET', 'HEAD') and not hmac.compare_digest(request.headers.get('x-csrf-token', ''), user['csrf']):
        raise HTTPException(403, 'Session verification failed. Refresh and try again.')
    return user


def login(body: Credentials, response: Response):
    user = read('users.json', {}).get(body.username)
    if not user or not hmac.compare_digest(user['password_hash'], password_hash(body.password, user['salt'])):
        raise HTTPException(401, 'Username or password is incorrect')
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
    with AUTH_LOCK:
        sessions = {k: v for k, v in read('sessions.json', {}).items() if v['expires'] > time.time()}
        sessions[token] = {'username': user['username'], 'csrf': csrf, 'expires': time.time() + 43200}
        write('sessions.json', dict(list(sessions.items())[-100:]))
    response.set_cookie('conveyor_session', token, httponly=True, samesite='strict', secure=os.getenv('SECURE_COOKIES', 'false').lower() == 'true', max_age=43200, path='/')
    return {'username': user['username'], 'role': user['role'], 'csrf': csrf}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--role', choices=['operator', 'viewer'], default='operator')
    args = parser.parse_args()
    username, password = os.getenv('CONVEYOR_USERNAME'), os.getenv('CONVEYOR_PASSWORD')
    if not username or not password:
        raise SystemExit('Set CONVEYOR_USERNAME and CONVEYOR_PASSWORD first.')
    Credentials(username=username, password=password)
    create_user(username, password, args.role)
    print(f'Account ready: {username} ({args.role})')
