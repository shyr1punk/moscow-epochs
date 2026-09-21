"""Stream a JSON array inside a ZIP without holding Moscow's address registry in RAM."""
import json,sys,zipfile,io
heritage=json.load(open(sys.argv[1],encoding='utf-8-sig'))
unoms={str(l['UNOM']) for r in heritage for l in r.get('Location',[]) if l.get('UNOM')}
decoder=json.JSONDecoder();matches=[];count=0
with zipfile.ZipFile(sys.argv[2]) as z:
 name=next(n for n in z.namelist() if n.endswith('.json'))
 with io.TextIOWrapper(z.open(name),encoding='utf-8-sig') as f:
  buf='';pos=0;eof=False
  while True:
   if not eof and len(buf)-pos<1048576:
    buf=buf[pos:]+f.read(1048576);pos=0;eof=len(buf)==0 or len(buf)<1048576
   while pos<len(buf) and buf[pos] in ' \r\n\t[,':pos+=1
   if pos>=len(buf) or buf[pos]==']':
    if eof or (pos<len(buf) and buf[pos]==']'):break
    continue
   try:r,end=decoder.raw_decode(buf,pos)
   except json.JSONDecodeError:
    more=f.read(1048576)
    if not more:raise
    buf=buf[pos:]+more;pos=0;continue
   pos=end;count+=1
   if str(r.get('UNOM','')) in unoms:matches.append(r)
json.dump(matches,open(sys.argv[3],'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
print(json.dumps({'sourceRecords':count,'matchedAddressRecords':len(matches),'requestedUnoms':len(unoms)}))
