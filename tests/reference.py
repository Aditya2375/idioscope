"""Independent PCA via numpy eigh and AR1 least squares, not production Jacobi."""
import subprocess,json,math
import numpy as np
script="""import{run,packed}from'./web/src/model.js';let out=[];for(const seed of[1,17,9999])for(const training of[80,120,160])for(const factors of[1,2,4]){let c={seed,training,factors},r=run(c);out.push([c,packed(r)]);}console.log(JSON.stringify(out));"""
d=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],text=True));checks=0
# Independent generator uses Python integer arithmetic and loops.
def data(seed):
 s=seed;old=[0.]*6;out=[]
 for t in range(200):
  u=[]
  for j in range(8):s=(1664525*s+1013904223)%(2**32);u.append((s/(2**32)-.5)*math.sqrt(12))
  row=[]
  for i in range(6):
   state=(.65+.04*i)*old[i]+.004*u[i+2];row.append((.8+.08*i)*.006*u[0]+(1 if i<3 else-1)*.003*u[1]+state-old[i]);old[i]=state
  out.append(row)
 return np.array(out)
def near(a,b,tol=2e-9):
 global checks
 a=np.array(a,dtype=float);b=np.array(b,dtype=float);assert a.shape==b.shape,(a.shape,b.shape);assert np.all(np.abs(a-b)<=tol*np.maximum(1,np.abs(b))),(np.max(np.abs(a-b)),tol);checks+=a.size
for c,r in d:
 T=c['training'];k=c['factors'];R=data(c['seed']);mu=R[:T].mean(axis=0);sd=R[:T].std(axis=0,ddof=1);Z=(R-mu)/sd;C=Z[:T].T@Z[:T]/(T-1);val,vec=np.linalg.eigh(C);val=val[::-1];vec=vec[:,::-1];P=vec[:,:k]@vec[:,:k].T;res=((np.eye(6)-P)@Z.T).T*sd;X=np.vstack([np.zeros((1,6)),np.cumsum(res,axis=0)])
 for a,b in zip(r[:4],[mu,sd,C,val]):near(a,b)
 near(r[5],P);near(r[6],res);near(r[7],X)
 # Compare projector instead of eigenvector signs and tied-vector orientation.
 scores=np.zeros((201,6));positions=np.zeros((200,6),dtype=int)
 for i in range(6):
  A=np.column_stack([np.ones(T),X[:T,i]]);a,b=np.linalg.lstsq(A,X[1:T+1,i],rcond=None)[0];variance=np.mean((X[1:T+1,i]-A@np.array([a,b]))**2);eligible=bool(0<b<1 and variance>1e-20);m=a/(1-b)if eligible else 0;eq=math.sqrt(variance/(1-b*b))if eligible else 0;hl=math.log(2)/-math.log(b)if eligible else 0
  assert eligible==r[8][i][0];near(r[8][i][1:],[a,b,variance,m,eq,hl])
  if eligible:
   scores[:,i]=(X[:,i]-m)/eq;pos=0
   for t in range(T,200):
    if t>T:
     score=scores[t,i]
     if pos==0:pos=1 if score<=-1.25 else -1 if score>=1.25 else 0
     elif pos==1:pos=0 if score>=-.5 else 1
     else:pos=0 if score<=.5 else-1
    positions[t,i]=pos
 near(r[9],scores);near(r[10],positions,0);near(r[11],val[:k].sum()/6)
print(f'{checks} independent Python/NumPy checks across {len(d)} full configurations passed')
