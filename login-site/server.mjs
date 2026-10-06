import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';
export function createLoginSite({username,password}) {
  if(!username||!password||password.length<20)throw new Error('Set LAB_USERNAME and LAB_PASSWORD (at least 20 characters)');
  const salt=randomBytes(16),expected=scryptSync(password,salt,32);
  const page=fs.readFileSync(new URL('./index.html',import.meta.url));
  return http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    const respond=(status,message)=>{res.writeHead(status,{'content-type':'text/plain; charset=utf-8'});res.end(message);};
    if(req.method==='GET'&&req.url==='/health')return respond(200,'ok');
    if(req.method==='GET'&&req.url==='/') {res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(page);}
    if(req.method!=='POST'||req.url!=='/login')return respond(404,'Not found');
    if(!(req.headers['content-type']??'').startsWith('application/x-www-form-urlencoded'))return respond(415,'Form data required');
    try {
      let bytes=0;const parts=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>4096)return respond(413,'Request too large');parts.push(chunk);}
      const form=new URLSearchParams(Buffer.concat(parts).toString()),provided=scryptSync((form.get('password')??'').slice(0,1024),salt,32);
      const valid=timingSafeEqual(provided,expected)&&form.get('username')===username;
      return respond(valid?200:401,valid?'Login verified. This lab contains no customer data.':'Invalid credentials');
    }catch{return respond(400,'Invalid request');}
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const site=createLoginSite({username:process.env.LAB_USERNAME,password:process.env.LAB_PASSWORD});
  site.requestTimeout=10000;site.headersTimeout=5000;
  site.listen(Number(process.env.LAB_PORT??3000),'127.0.0.1',()=>console.log('WayTrace login lab ready on loopback'));
  process.on('SIGTERM',()=>site.close());
}
