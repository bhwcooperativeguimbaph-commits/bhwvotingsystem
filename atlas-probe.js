'use strict';
/**
 * Atlas-only connectivity probe, no MySQL initialization, no election API.
 * Start with: npm run start:atlas-probe
 * Keep this service private until full API migration and security review.
 */
const http=require('node:http');
const {connectMongo}=require('./database/mongodb');
const port=Number(process.env.PORT)||10000;
let connection;
const server=http.createServer((req,res)=>{
  if(req.url!=='/health' || req.method!=='GET') {
    res.writeHead(404,{'Content-Type':'application/json','Cache-Control':'no-store'});
    return res.end(JSON.stringify({error:'Not found'}));
  }
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify({status:'ok',database:'mongodb',mode:'connectivity-only'}));
});
async function main(){
  connection=await connectMongo();
  // This server intentionally does not expose registration, voting or admin routes.
  server.listen(port,'0.0.0.0',()=>console.log('Atlas connectivity probe listening'));
}
async function shutdown(){
  server.close();
  if(connection) await connection.client.close();
}
process.once('SIGTERM',()=>{shutdown().then(()=>process.exit(0)).catch(()=>process.exit(1));});
process.once('SIGINT',()=>{shutdown().then(()=>process.exit(0)).catch(()=>process.exit(1));});
main().catch(e=>{
  console.error('Atlas probe startup failed:',e.name==='MongoServerSelectionError'?'Database connection unavailable':'Configuration or database failure');
  process.exitCode=1;
});
