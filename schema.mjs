import {DatabaseSync} from 'node:sqlite';
import {chmodSync} from 'node:fs';
export function openStore(path){
 const db=new DatabaseSync(path);
 if(path!==':memory:')chmodSync(path,0o600);
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);
 CREATE TABLE IF NOT EXISTS board(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS principals(id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('human','service')));
 CREATE TABLE IF NOT EXISTS passkeys(id TEXT PRIMARY KEY, principal TEXT NOT NULL REFERENCES principals(id), public_key BLOB NOT NULL, counter INTEGER NOT NULL, transports TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(digest TEXT PRIMARY KEY, principal TEXT NOT NULL REFERENCES principals(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS challenges(digest TEXT PRIMARY KEY, kind TEXT NOT NULL, challenge TEXT NOT NULL, expires INTEGER NOT NULL);
 INSERT OR IGNORE INTO migrations VALUES(1);`);
 return {db,load(){const r=db.prepare('SELECT body FROM board WHERE id=1').get();return r?JSON.parse(r.body):null;},
 save(state,expected){
  if(expected===undefined){db.prepare('INSERT INTO board VALUES(1,?,?)').run(state.revision,JSON.stringify(state));return;}
  const r=db.prepare('UPDATE board SET revision=?,body=? WHERE id=1 AND revision=?').run(state.revision,JSON.stringify(state),expected);
  if(r.changes!==1)throw Error('Revision conflict');
 },close(){db.close();}};
}
