import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'), { timeoutDuration: 5000 });
const unauthorized = () => Object.assign(Error('unauthorized'), { status: 401 });
// Inject only the public-key resolver in tests; signature and claim validation stay real.
export function createFirebaseAuthenticator({ keyResolver = jwks, now = Date.now } = {}) {
 return async (request, env) => {
  const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token || token.length > 16384 || !env.FIREBASE_PROJECT) throw unauthorized();
  try {
   const seconds=now()/1000;
   const {payload,protectedHeader}=await jwtVerify(token,keyResolver,{
    algorithms:['RS256'],issuer:`https://securetoken.google.com/${env.FIREBASE_PROJECT}`,
    audience:env.FIREBASE_PROJECT,currentDate:new Date(seconds*1000),
    requiredClaims:['exp','iat','auth_time','sub'],
   });
   if (typeof protectedHeader.kid!=='string'||!protectedHeader.kid ||
       typeof payload.sub!=='string'||!payload.sub||payload.sub.length>128 ||
       !Number.isFinite(payload.iat)||payload.iat<0||payload.iat>seconds ||
       !Number.isFinite(payload.auth_time)||payload.auth_time<0||payload.auth_time>seconds ||
       payload.auth_time>payload.iat||payload.exp<=payload.iat) throw unauthorized();
   return payload.sub;
  } catch { throw unauthorized(); }
 };
}
