/* ============================================================
   GESTOR DE OBRAS MT/BT — app.js
   Vanilla JS. Persistencia: Supabase (compartida) + IndexedDB
   (espejo local para offline). Sin backend propio.
   ============================================================ */
(function(){
'use strict';

/* ---------------- Registro de diagnóstico (para depurar la nube) ---------------- */
window.__DIAG = window.__DIAG || [];
function diag(m){ try{ window.__DIAG.push(new Date().toLocaleTimeString()+' '+m); }catch(e){} }

/* ---------------- Utilidades ---------------- */
function $id(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function fmtNum(n){ return String(n==null?0:n).replace('.',','); }
function fmtEuro(n){ return fmtNum(n)+' €'; }
function round2(n){ return Math.round((n||0)*100)/100; }
function ahora(){ return new Date().toLocaleString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function toast(msg){ var t=$id('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(function(){ t.classList.remove('show'); },2600); }
function dataUrlToBlob(dataUrl){
  var arr = dataUrl.split(','), mime = arr[0].match(/:(.*?);/)[1];
  var bin = atob(arr[1]), len = bin.length, bytes = new Uint8Array(len);
  for(var i=0;i<len;i++) bytes[i]=bin.charCodeAt(i);
  return new Blob([bytes],{type:mime});
}
function descargar(blob, nombre){
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=nombre; a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 3000);
}
function claseEstado(estado){
  var m = {'Alta':'Alta','Replanteo':'Replanteo','Presupuesto':'Presupuesto','En ejecución':'en-ejecucion','Parada':'Parada','Finalizada':'Finalizada','Facturada':'Facturada'};
  return m[estado]||'Alta';
}

/* ---------------- Datos de catálogo ---------------- */
var DAT = window.DATOS || {baremo:[],municipios:[],valorpunto:[],templates:[],materiales:[]};
var DATOS_CARGADOS = (DAT.baremo && DAT.baremo.length>0) || (DAT.materiales && DAT.materiales.length>0);

function normalizarFamilia(f){
  return String(f||'').trim().replace(/\s*-\s*I$/,'').trim();
}
function buscarValorPunto(e,f){
  e=e||''; f=f||'';
  var fn = normalizarFamilia(f);
  for(var j=0;j<DAT.valorpunto.length;j++){
    var v=DAT.valorpunto[j];
    if(v.e===e && normalizarFamilia(v.f)===fn) return v;
  }
  if(e && f!==e){
    for(var k=0;k<DAT.valorpunto.length;k++){
      var w=DAT.valorpunto[k];
      if(w.e===e && w.f===e) return w;
    }
  }
  return null;
}
function precioPartida(codigo){
  var p=null;
  for(var i=0;i<DAT.baremo.length;i++){ if(DAT.baremo[i].c===codigo){ p=DAT.baremo[i]; break; } }
  if(!p) return null;
  var vp = buscarValorPunto(p.e,p.f);
  var valor = vp?vp.v:0;
  var aviso = !vp || /tension/i.test(p.f||'');
  return { partida:p, importe:round2(p.p*valor), puntos:p.p||0, valorPunto:valor, aviso:aviso };
}
function totalValoracion(o){
  var tot = 0;
  (o.replanteo||[]).forEach(function(r){
    var pr = precioPartida(r.codigo);
    if(pr && pr.importe) tot += pr.importe * (r.cantidad||0);
  });
  return round2(tot);
}
function buscarBaremo(t){
  var out=[];
  t = String(t||'').toLowerCase();
  for(var i=0;i<DAT.baremo.length;i++){
    var p=DAT.baremo[i];
    if(p.c.toLowerCase().indexOf(t)>=0 || p.d.toLowerCase().indexOf(t)>=0 || (p.f||'').toLowerCase().indexOf(t)>=0 || (p.g||'').toLowerCase().indexOf(t)>=0) out.push(p);
  }
  return out;
}
function buscarMateriales(t){
  var out=[];
  t = String(t||'').toLowerCase();
  for(var i=0;i<DAT.materiales.length;i++){
    var m=DAT.materiales[i];
    if(m.c.toLowerCase().indexOf(t)>=0 || m.d.toLowerCase().indexOf(t)>=0) out.push(m);
  }
  return out;
}
function buscarCombinado(texto, filtro){
  var t=texto.trim().toLowerCase();
  if(!t && !filtro) return [];
  var out=[];
  buscarBaremo(t).forEach(function(p){
    if(filtro && filtro!=='_materiales'){
      var nf = normalizarFamilia(p.f||'');
      var ne = normalizarFamilia(p.e||'');
      var nfiltro = normalizarFamilia(filtro);
      if(nf!==nfiltro && ne!==nfiltro) return;
    }
    var pr = precioPartida(p.c);
    out.push({tipo:'partida',c:p.c,d:p.d,u:p.u,f:p.f,e:p.e,puntos:p.p,importe:pr?pr.importe:0,valorPunto:pr?pr.valorPunto:0,aviso:pr?pr.aviso:true});
  });
  if(!filtro || filtro==='_materiales'){
    buscarMateriales(t).forEach(function(m){
      out.push({tipo:'material',c:m.c,d:m.d,u:m.u,g:m.g||'',puntos:0,importe:0,valorPunto:0,aviso:false});
    });
  }
  out.sort(function(a,b){ return a.d<b.d?-1:1; });
  return out.slice(0,80);
}
function nombrePartida(codigo){
  for(var i=0;i<DAT.baremo.length;i++) if(DAT.baremo[i].c===codigo) return DAT.baremo[i].d;
  return 'Código sin descripción';
}
function datosPartida(codigo){
  for(var i=0;i<DAT.baremo.length;i++) if(DAT.baremo[i].c===codigo) return DAT.baremo[i];
  for(var j=0;j<DAT.materiales.length;j++) if(DAT.materiales[j].c===codigo) return {d:DAT.materiales[j].d,u:DAT.materiales[j].u};
  return null;
}

/* ---------------- Almacenamiento: Supabase + IndexedDB ---------------- */
var STORAGE = (function(){
  var MEM = new Map();
  var backend = null;
  var idbPromise = null;
  var S = { url:(window.CONFIG&&window.CONFIG.supabaseUrl)||'', key:(window.CONFIG&&window.CONFIG.supabaseAnonKey)||'', table:(window.CONFIG&&window.CONFIG.supabaseTable)||'kv' };
  var _retryQ = [];
  var _retryTimer = null;

  function idbOpen(){
    if(idbPromise) return idbPromise;
    idbPromise = new Promise(function(resolve,reject){
      if(!('indexedDB' in window)) return reject(new Error('no indexedDB'));
      var req = indexedDB.open('gestor-obras',1);
      req.onupgradeneeded = function(e){ var db=e.target.result; if(!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); };
      req.onsuccess = function(e){ resolve(e.target.result); };
      req.onerror = function(){ reject(req.error); };
    });
    return idbPromise;
  }
  function idbGet(key){ return idbOpen().then(function(db){ return new Promise(function(res,rej){ var t=db.transaction('kv').objectStore('kv').get(key); t.onsuccess=function(){res(t.result);}; t.onerror=function(){rej(t.error);}; }); }); }
  function idbSet(key,val){ return idbOpen().then(function(db){ return new Promise(function(res,rej){ var t=db.transaction('kv','readwrite').objectStore('kv').put(val,key); t.onsuccess=function(){res();}; t.onerror=function(){rej(t.error);}; }); }); }
  function idbDel(key){ return idbOpen().then(function(db){ return new Promise(function(res,rej){ var t=db.transaction('kv','readwrite').objectStore('kv').delete(key); t.onsuccess=function(){res();}; t.onerror=function(){rej(t.error);}; }); }); }
  function idbKeys(){ return idbOpen().then(function(db){ return new Promise(function(res,rej){ var t=db.transaction('kv').objectStore('kv').getAllKeys(); t.onsuccess=function(){res(t.result);}; t.onerror=function(){rej(t.error);}; }); }); }

  function sbReq(method, qs, body, prefer){
    var h = { 'apikey':S.key, 'Authorization':'Bearer '+S.key, 'Content-Type':'application/json' };
    if(prefer) h.Prefer = prefer;
    var url = S.url+'/rest/v1/'+S.table+qs;
    var opts = { method:method, headers:h, body:body?JSON.stringify(body):undefined };
    return fetch(url, opts).then(function(r){
      if(!r.ok && r.status!==204) return r.text().then(function(t){ throw new Error('Supabase '+r.status+': '+t); });
      if(method==='GET') return r.text().then(function(t){ return t?JSON.parse(t):null; });
      return null;
    });
  }
  var sbGet = function(key){ return sbReq('GET','?select=value&key=eq.'+encodeURIComponent(key)).then(function(a){ return a&&a[0]&&a[0].value!==undefined?a[0].value:null; }); };
  var sbSet = function(key,val){ return sbReq('POST','',[{key:key,value:val}],'resolution=merge-duplicates,return=minimal'); };
  var sbDel = function(key){ return sbReq('DELETE','?key=eq.'+encodeURIComponent(key)); };
  var sbList = function(){ return sbReq('GET','?select=key,value&limit=10000'); };

  function _actualizarDot(){
    var dot = $id('dotSync'), txt = $id('txtSync');
    if(!dot || !txt) return;
    if(!navigator.onLine){ dot.className='dot off'; txt.textContent='Sin conexión'; }
    else if(_retryQ.length){ dot.className='dot sync'; txt.textContent='Sincronizando…'; }
    else if(backend==='supabase'){ dot.className='dot'; txt.textContent='Nube'; }
    else { dot.className='dot'; txt.textContent='Local'; }
  }

  function _colaNube(key, val, method){
    _retryQ.push({key:key, val:val, method:method, attempts:0});
    _actualizarDot();
    if(!_retryTimer) _iniciarRetry();
  }

  function _iniciarRetry(){
    _retryTimer = setInterval(function(){
      if(!_retryQ.length){ clearInterval(_retryTimer); _retryTimer=null; _actualizarDot(); return; }
      var item = _retryQ[0];
      var op = item.method==='set' ? sbSet(item.key, item.val) : sbDel(item.key);
      op.then(function(){
        _retryQ.shift();
        _actualizarDot();
      }, function(e){
        item.attempts++;
        if(item.attempts >= 20){ _retryQ.shift(); }
        _actualizarDot();
      });
    }, 3000);
  }

  function init(){
    function cargarIdb(){
      return idbKeys().then(function(keys){
        return Promise.all(keys.map(function(k){ return idbGet(k).then(function(v){ MEM.set(k,v); }); }));
      });
    }
    return new Promise(function(resolve){
      var usarSupabase = S.url && S.key;
      function desdeIdb(){
        backend='idb';
        diag('init → modo LOCAL (nube no disponible)');
        _actualizarDot();
        cargarIdb().then(function(){ resolve('idb'); }, function(){ resolve('idb'); });
      }
      if(!usarSupabase){ desdeIdb(); return; }
      backend='supabase';
      cargarIdb().then(function(){
        return sbList();
      }).then(function(rows){
        rows = rows||[];
        diag('init → sbList rows='+rows.length+' → modo NUBE');
        if(rows.length){
          rows.forEach(function(r){
            MEM.set(r.key, r.value);
            idbSet(r.key, r.value).catch(function(){});
          });
        }
        _actualizarDot();
        resolve('supabase');
      }, function(e){
        diag('init → sbList FALLO: '+String((e&&e.message)||e).slice(0,140));
        STORAGE.supabaseError = e;
        desdeIdb();
      });
    });
  }

  return {
    init: init,
    backend: function(){ return backend; },
    pendingSync: function(){ return _retryQ.length; },
    flushSync: function(){ _retryQ.forEach(function(item){ item.attempts = 0; }); if(_retryQ.length && !_retryTimer) _iniciarRetry(); },
    get: function(key){ return Promise.resolve(MEM.has(key)?MEM.get(key):null); },
    set: function(key,val){
      MEM.set(key,val);
      idbSet(key,val).catch(function(){});
      if(backend==='supabase'){
        sbSet(key,val).then(function(){}, function(e){
          diag('nube fallo set '+key+': '+String((e&&e.message)||e).slice(0,100));
          _colaNube(key, val, 'set');
        });
      }
      return Promise.resolve();
    },
    remove: function(key){
      MEM.delete(key);
      idbDel(key).catch(function(){});
      if(backend==='supabase'){
        sbDel(key).then(function(){}, function(e){
          diag('nube fallo del '+key+': '+String((e&&e.message)||e).slice(0,100));
          _colaNube(key, null, 'del');
        });
      }
      return Promise.resolve();
    },
    keys: function(prefix){ return Promise.resolve(Array.from(MEM.keys()).filter(function(k){ return !prefix||k.indexOf(prefix)===0; })); }
  };
})();

/* ---------------- Estado de la app ---------------- */
var app = {
  obras: [],            // resumen desde 'index'
  obra: null,           // obra actual
  fotos: [],            // fotos de la obra actual
  vista: 'lista',       // lista | alta | detalle
  tab: 'partidas',
  busquedaPartida: '',
  busquedaFiltro: '',
  online: true,
  instalable: false
};

/* ---------------- Operaciones de obra ---------------- */
function indiceResumen(o){
  return { id:o.id, lcl:o.lcl, direccion:o.direccion, municipio:o.municipio, estado:o.estado, fechaAlta:o.fechaAlta, correo:o.correo, valoracion:totalValoracion(o) };
}
async function guardarLista(){ await STORAGE.set('index', app.obras); }
async function guardarObra(){
  await STORAGE.set('obra:'+app.obra.id, app.obra);
  for(var i=0;i<app.obras.length;i++){ if(app.obras[i].id===app.obra.id){ app.obras[i]=indiceResumen(app.obra); break; } }
  await guardarLista();
}
async function guardarFotos(){ await STORAGE.set('fotos:'+app.obra.id, app.fotos); }
function addHistorial(texto){ app.obra.historial = app.obra.historial||[]; app.obra.historial.push({fecha:ahora(), texto:texto}); }

async function cargarObra(id){
  app.obra = await STORAGE.get('obra:'+id);
  app.fotos = await STORAGE.get('fotos:'+id) || [];
  if(!app.obra) return false;
  app.obra.replanteo = app.obra.replanteo||[];
  app.obra.materiales = app.obra.materiales||[];
  app.obra.facturacion = app.obra.facturacion||[];
  app.obra.documentos = app.obra.documentos||[];
  app.obra.historial = app.obra.historial||[];
  var tot = totalValoracion(app.obra);
  for(var i=0;i<app.obras.length;i++){
    if(app.obras[i].id===id && app.obras[i].valoracion!==tot){
      app.obras[i].valoracion = tot;
      guardarLista();
      break;
    }
  }
  return true;
}
async function eliminarObra(id){
  await STORAGE.remove('obra:'+id);
  await STORAGE.remove('fotos:'+id);
  app.obras = app.obras.filter(function(o){ return o.id!==id; });
  await guardarLista();
}

/* ---------------- Líneas de replanteo/materiales ---------------- */
function buscarLinea(lista, codigo){ for(var i=0;i<lista.length;i++){ if(lista[i].codigo===codigo) return i; } return -1; }
function anadirLinea(tipo, codigo){
  var lista = tipo==='partida' ? app.obra.replanteo : app.obra.materiales;
  var i = buscarLinea(lista, codigo);
  if(i>=0){ lista[i].cantidad = (lista[i].cantidad||0)+1; }
  else lista.push({codigo:codigo, cantidad:1, comentario:''});
  guardarObra();
  renderPartidas();
}
function anadirLineaCant(tipo, codigo, cantidad){
  var lista = tipo==='partida' ? app.obra.replanteo : app.obra.materiales;
  var i = buscarLinea(lista, codigo);
  if(i>=0){ lista[i].cantidad = (lista[i].cantidad||0)+cantidad; }
  else lista.push({codigo:codigo, cantidad:cantidad, comentario:''});
  guardarObra();
  renderPartidas();
}
function setCantidad(tipo, codigo, val){
  var lista = tipo==='partida' ? app.obra.replanteo : app.obra.materiales;
  var i = buscarLinea(lista, codigo);
  if(i<0) return;
  var n = parseInt(val,10);
  lista[i].cantidad = isNaN(n)||n<0 ? 0 : n;
  guardarObra();
  renderPartidas();
}
function borrarLinea(tipo, codigo){
  var lista = tipo==='partida' ? app.obra.replanteo : app.obra.materiales;
  app.obra[tipo==='partida'?'replanteo':'materiales'] = lista.filter(function(x){ return x.codigo!==codigo; });
  guardarObra();
  renderPartidas();
}
function guardarComentarioLinea(tipo, codigo, texto){
  var lista = tipo==='partida' ? app.obra.replanteo : app.obra.materiales;
  var i = buscarLinea(lista, codigo);
  if(i>=0){ lista[i].comentario = texto; guardarObra(); renderPartidas(); }
}

/* ---------------- Fotos ---------------- */
function comprimirImagen(file, maxW, calidad){
  return new Promise(function(resolve,reject){
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function(){
      URL.revokeObjectURL(url);
      var scale = Math.min(1, maxW/img.width);
      var w = Math.round(img.width*scale), h = Math.round(img.height*scale);
      var cv = document.createElement('canvas');
      cv.width=w; cv.height=h;
      var ctx = cv.getContext('2d');
      ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h);
      ctx.drawImage(img,0,0,w,h);
      resolve({ dataUrl: cv.toDataURL('image/jpeg', calidad), width:w, height:h });
    };
    img.onerror = reject;
    img.src = url;
  });
}
function addFoto(dataUrl, width, height, tipo, codigo){
  app.fotos.push({ id:uid(), dataUrl:dataUrl, width:width, height:height, comentario:'', partidaCodigo:codigo||null, tipo:tipo, fecha:new Date().toISOString() });
  guardarFotos();
}
function fotosDe(tipo, codigo){ return app.fotos.filter(function(f){ return f.tipo===tipo && f.partidaCodigo===codigo; }); }
function guardarComentarioFoto(id, texto){
  for(var i=0;i<app.fotos.length;i++){ if(app.fotos[i].id===id){ app.fotos[i].comentario=texto; break; } }
  guardarFotos();
}
function borrarFoto(id){
  app.fotos = app.fotos.filter(function(f){ return f.id!==id; });
  guardarFotos();
}

/* ---------------- UI: lista de obras ---------------- */
function renderLista(){
  var q = ($id('buscadorObras').value||'').toLowerCase().trim();
  var lista = app.obras.filter(function(o){
    if(!q) return true;
    return (o.lcl||'').toLowerCase().indexOf(q)>=0 || (o.direccion||'').toLowerCase().indexOf(q)>=0 || (o.municipio||'').toLowerCase().indexOf(q)>=0 || (o.correo||'').toLowerCase().indexOf(q)>=0;
  }).sort(function(a,b){ return (b.lcl||'').localeCompare(a.lcl||''); });
  var html = '';
  if(!lista.length){
    html = '<div class="espacio" style="color:#6b7280;text-align:center;padding-top:30px">'+(app.obras.length? 'Sin resultados.':'No hay obras todavía. Pulsa + para crear la primera.')+'</div>';
  }
  lista.forEach(function(o){
    html += '<div class="obra-item" data-abrir="'+esc(o.id)+'">'
      + '<div class="obra-izq">'
      + '<div class="obra-lcl">'+esc(o.lcl||'Sin LCL')+'</div>'
      + '<div class="obra-dir">'+esc(o.direccion||'')+(o.municipio?', '+esc(o.municipio):'')+'</div>'
      + '<div class="obra-val">Valoración: <b>'+(o.valoracion!=null?fmtEuro(o.valoracion):'—')+'</b></div>'
      + '</div>'
      + '<span class="estado-chip '+claseEstado(o.estado)+'">'+esc(o.estado||'Alta')+'</span>'
      + '<button class="btn-eliminar" data-borrar="'+esc(o.id)+'" title="Eliminar obra">🗑</button>'
      + '</div>';
  });
  $id('listaObras').innerHTML = html;
}

/* ---------------- UI: alta de obra ---------------- */
function rellenarMunicipio(nombre){
  var n = (nombre||'').trim().toLowerCase();
  if(!n) return;
  for(var i=0;i<DAT.municipios.length;i++){
    var m = DAT.municipios[i];
    if((m.n||'').toLowerCase()===n){
      $id('fProvincia').value = m.p||'';
      $id('fCc').value = m.cc||'';
      $id('fZonaAereo').value = m.za||m.zona||'';
      $id('fZonaSubt').value = m.zs||m.zona||'';
      break;
    }
  }
}
function llenarTemplates(){
  var opts = '';
  DAT.templates.forEach(function(t,i){ opts += '<option value="'+i+'">'+esc(t.nombre||('Plantilla '+(i+1)))+'</option>'; });
  $id('fTemplate').innerHTML = '<option value="">— ninguna —</option>'+opts;
  $id('selectTemplate').innerHTML = '<option value="">— elegir plantilla —</option>'+opts;
}
function abrirAlta(){
  app.vista='alta';
  $id('vistaLista').classList.add('hidden');
  $id('vistaDetalle').classList.add('hidden');
  $id('vistaAlta').classList.remove('hidden');
  $id('btnNuevaObra').classList.add('hidden');
  $id('tituloCab').textContent='Nueva obra';
  // datalist de municipios
  var dl='';
  DAT.municipios.forEach(function(m){ dl += '<option value="'+esc(m.n)+'">'; });
  $id('listaMunicipios').innerHTML = dl;
  $id('fLcl').focus();
}
function crearObra(){
  var lcl = $id('fLcl').value.trim();
  if(!lcl){ toast('El LCL es obligatorio'); return; }
  var o = {
    id: uid(), lcl:lcl, direccion:$id('fDireccion').value.trim(),
    municipio:$id('fMunicipio').value.trim(),
    zonaAereo:$id('fZonaAereo').value.trim(), zonaSubt:$id('fZonaSubt').value.trim(),
    correo:$id('fCorreo').value,
    estado:'Alta', estadoAnterior:null, motivoParada:'', fechaAlta:ahora(),
    replanteo:[], materiales:[], facturacion:[], documentos:[], historial:[{fecha:ahora(), texto:'Alta de la obra'}]
  };
  var t = $id('fTemplate').value;
  if(t!=='') aplicarTemplate(o, parseInt(t,10));
  app.obras.unshift(indiceResumen(o));
  guardarLista();
  STORAGE.set('obra:'+o.id, o);
  app.obra = o; app.fotos = [];
  toast('Obra creada');
  abrirDetalle();
  limpiarFormularioAlta();
}
function limpiarFormularioAlta(){
  ['fLcl','fDireccion','fMunicipio','fZonaAereo','fZonaSubt','fProvincia','fCc','fCorreo'].forEach(function(x){ $id(x).value=''; });
  $id('fTemplate').value='';
}

/* ---------------- UI: detalle ---------------- */
function abrirDetalle(){
  app.vista='detalle';
  $id('vistaLista').classList.add('hidden');
  $id('vistaAlta').classList.add('hidden');
  $id('vistaDetalle').classList.remove('hidden');
  $id('btnNuevaObra').classList.add('hidden');
  $id('btnVolver').classList.remove('hidden');
  $id('tituloCab').textContent = app.obra.lcl||'Obra';
  renderDetalle();
}
function renderDetalle(){
  var o = app.obra;
  $id('cLcl').textContent = o.lcl||'-';
  $id('cDir').textContent = (o.direccion||'')+(o.municipio?', '+o.municipio:'');
  $id('cEstado').textContent = o.estado||'Alta';
  $id('cEstado').className = 'estado-chip '+claseEstado(o.estado);
  $id('cZonas').textContent = (o.zonaAereo?'Aéreo: '+o.zonaAereo:'')+(o.zonaSubt?' · Subt: '+o.zonaSubt:'');
  renderFases();
  renderTabs();
  renderPartidas();
  renderGaleria();
  renderDocs();
  renderFacturacion();
  renderHistorial();
  renderCorreo();
}
function renderFases(){
  var FASES = ['Alta','Replanteo','Presupuesto','En ejecución','Finalizada','Facturada'];
  var o = app.obra;
  var html = '';
  FASES.forEach(function(f){
    var activa = o.estado===f;
    html += '<button class="fase-btn'+(activa?' activa':'')+'" data-fase="'+esc(f)+'">'+esc(f)+'</button>';
  });
  if(o.estado==='Parada'){
    html += '<button class="fase-btn" style="background:#fee2e2;color:#991b1b" id="btnReanudar">▶ Reanudar</button>';
  }
  html += '<button class="fase-btn" id="btnParar">⏸ Parar obra</button>';
  $id('fasesBar').innerHTML = html;
  if(o.estado==='Parada') $id('btnReanudar').addEventListener('click', reanudarObra);
  $id('btnParar').addEventListener('click', pararObra);
  $id('fasesBar').querySelectorAll('.fase-btn[data-fase]').forEach(function(b){
    b.addEventListener('click', function(){ saltarFase(b.getAttribute('data-fase')); });
  });
}
function saltarFase(f){
  var o=app.obra;
  if(o.estado===f) return;
  o.estadoAnterior = o.estado;
  o.estado = f;
  o.motivoParada='';
  addHistorial('Cambio de fase: '+f);
  guardarObra(); renderDetalle(); toast('Fase: '+f);
}
function pararObra(){
  var o=app.obra;
  if(o.estado==='Parada') return;
  var motivo = prompt('Motivo de la parada:');
  if(motivo===null) return;
  o.estadoAnterior = o.estado;
  o.estado = 'Parada';
  o.motivoParada = motivo||'';
  addHistorial('Obra parada'+(motivo?' — '+motivo:''));
  guardarObra(); renderDetalle();
}
function reanudarObra(){
  var o=app.obra;
  if(o.estado!=='Parada') return;
  o.estado = o.estadoAnterior||'Alta';
  o.estadoAnterior = null;
  addHistorial('Obra reanudada');
  guardarObra(); renderDetalle();
}
function renderTabs(){
  $id('tabs').querySelectorAll('button').forEach(function(b){
    b.classList.toggle('activa', b.getAttribute('data-tab')===app.tab);
  });
  ['partidas','fotos','documentos','facturacion','control','calendario'].forEach(function(t){
    $id('tab-'+t).classList.toggle('hidden', t!==app.tab);
  });
}

/* ---------------- Partidas ---------------- */
function renderFiltros(){
  var el = $id('filtrosBusqueda');
  if(!el) return;
  var esps = {};
  DAT.baremo.forEach(function(p){
    var e = normalizarFamilia(p.e||p.f||'');
    if(e) esps[e]=1;
  });
  var chips = '<button class="filtro-chip'+(!app.busquedaFiltro?' activo':'')+'" data-filtro="">Todas</button>';
  Object.keys(esps).sort().forEach(function(e){
    chips += '<button class="filtro-chip'+(app.busquedaFiltro===e?' activo':'')+'" data-filtro="'+esc(e)+'">'+esc(e)+'</button>';
  });
  chips += '<button class="filtro-chip'+(app.busquedaFiltro==='_materiales'?' activo':'')+'" data-filtro="_materiales">Materiales</button>';
  el.innerHTML = chips;
}
function renderResultados(){
  var res = buscarCombinado(app.busquedaPartida, app.busquedaFiltro);
  var el = $id('resultadosBusqueda');
  var buscaVacia = !app.busquedaPartida.trim() && !app.busquedaFiltro;
  if(buscaVacia || !res.length){ el.classList.add('hidden'); return; }
  var html = '<div class="resultados-contador">'+res.length+' resultado'+(res.length!==1?'s':'')+'</div>';
  var replMap = {}, matMap = {};
  if(app.obra){
    (app.obra.replanteo||[]).forEach(function(r){ replMap[r.codigo]=(r.cantidad||0); });
    (app.obra.materiales||[]).forEach(function(m){ matMap[m.codigo]=(m.cantidad||0); });
  }
  res.forEach(function(r){
    var ya = r.tipo==='partida' ? (replMap[r.c]||0) : (matMap[r.c]||0);
    var yaStr = ya ? '<span class="ri-ya">✓ '+ya+' '+esc(r.u||'un')+'</span>' : '';
    var clase = ya ? ' ya-anadido' : '';
    var precioStr = '';
    if(r.tipo==='partida' && r.valorPunto){
      precioStr = '<span class="ri-precio">'+fmtNum(r.puntos)+' pts · '+fmtNum(r.valorPunto)+' €/pt · '+fmtEuro(r.importe)+'</span>';
    }
    var metaExtra = r.tipo==='partida' ? esc(r.e||'')+(r.f?' · '+esc(r.f):'') : esc(r.g||'Material');
    html += '<div class="resultado-item'+clase+'" data-cod="'+esc(r.c)+'" data-tipo="'+r.tipo+'">'
      + '<div class="ri-top">'
      + '<span class="tipo-flag '+r.tipo+'">'+r.tipo+'</span>'
      + '<span class="linea-codigo">'+esc(r.c)+'</span>'
      + '<span style="font-size:11px;color:var(--sub)">'+esc(r.u||'')+'</span>'
      + yaStr
      + '</div>'
      + '<div class="ri-desc">'+esc(r.d)+'</div>'
      + '<div class="ri-meta">'+metaExtra+'</div>'
      + precioStr
      + '<div class="ri-bottom">'
      + '<input type="number" class="ri-cant" min="1" value="1" data-cant="'+esc(r.c)+'">'
      + '<button class="ri-add" data-add="'+r.tipo+'" data-cod="'+esc(r.c)+'">+ Añadir</button>'
      + '</div>'
      + '</div>';
  });
  el.innerHTML = html;
  el.classList.remove('hidden');
}
function renderPartidas(){
  var o = app.obra;
  var total = totalValoracion(o);
  $id('resumenValoracion').innerHTML = 'Valoración total: <span class="imp">'+fmtEuro(total)+'</span>';
  $id('cValoracion').innerHTML = 'Valoración: <b>'+fmtEuro(total)+'</b>';
  // partidas
  var hp = '';
  o.replanteo.forEach(function(r){
    var pr = precioPartida(r.codigo);
    var imp = pr ? round2(pr.importe * r.cantidad) : 0;
    var uni = pr?pr.partida.u:'';
    var desc = pr?pr.partida.d:nombrePartida(r.codigo);
    var fotos = fotosDe('partida', r.codigo);
    hp += lineaHTML(r.codigo, desc, uni, r.cantidad, imp, pr&&pr.aviso, r.comentario, fotos.length, 'partida', pr?pr.valorPunto:null);
  });
  $id('listaPartidas').innerHTML = hp || '<div class="espacio" style="color:#9ca3af;font-size:13px">Sin partidas. Búscalas arriba o carga una valoración tipo.</div>';
  $id('nPartidas').textContent = '('+o.replanteo.length+')';
  // materiales
  var hm = '';
  o.materiales.forEach(function(m){
    var mt = datosPartida(m.codigo);
    var fotos = fotosDe('material', m.codigo);
    hm += lineaHTML(m.codigo, mt?mt.d:nombrePartida(m.codigo), mt?mt.u:'', m.cantidad, 0, false, m.comentario, fotos.length, 'material', null);
  });
  $id('listaMateriales').innerHTML = hm || '<div class="espacio" style="color:#9ca3af;font-size:13px">Sin materiales añadidos.</div>';
  $id('nMateriales').textContent = '('+o.materiales.length+')';
  // enlazar eventos
  document.querySelectorAll('.stepper [data-step]').forEach(function(b){
    b.addEventListener('click', function(){
      var tipo=b.getAttribute('data-step'), cod=b.getAttribute('data-cod');
      var lista = tipo==='partida'?o.replanteo:o.materiales;
      var i = buscarLinea(lista, cod);
      var nv = (lista[i].cantidad||0) + (b.textContent==='+'?1:-1);
      if(nv<0) nv=0;
      setCantidad(tipo, cod, nv);
    });
  });
  document.querySelectorAll('.stepper input').forEach(function(inp){
    inp.addEventListener('change', function(){ setCantidad(inp.getAttribute('data-tipo'), inp.getAttribute('data-cod'), inp.value); });
  });
  document.querySelectorAll('[data-borrar-linea]').forEach(function(b){
    b.addEventListener('click', function(){ borrarLinea(b.getAttribute('data-borrar-linea'), b.getAttribute('data-cod')); });
  });
  document.querySelectorAll('[data-foto]').forEach(function(b){
    b.addEventListener('click', function(){ pedirFoto(b.getAttribute('data-foto'), b.getAttribute('data-cod')); });
  });
  document.querySelectorAll('[data-comenta]').forEach(function(b){
    b.addEventListener('click', function(){ editarComentarioLinea(b.getAttribute('data-comenta'), b.getAttribute('data-cod')); });
  });
  document.querySelectorAll('[data-galeria]').forEach(function(b){
    b.addEventListener('click', function(){ abrirGaleria(b.getAttribute('data-galeria'), b.getAttribute('data-cod')); });
  });
  renderResultados();
}
function lineaHTML(codigo, desc, uni, cantidad, imp, aviso, comentario, nFotos, tipo, valorPunto){
  var impStr = tipo==='partida' ? (aviso?'<span class="linea-importe cero" title="Familia sin valor de punto">'+fmtEuro(imp)+'</span>':'<span class="linea-importe">'+fmtEuro(imp)+'</span>') : '';
  var avisoStr = aviso?'<div class="linea-aviso">⚠ familia sin valor de punto en el catálogo</div>':'';
  var comStr = comentario?'<div class="comentario-linea">💬 '+esc(comentario)+'</div>':'';
  return '<div class="linea">'
    + '<div class="linea-fila1"><span class="linea-codigo">'+esc(codigo)+'</span><span class="linea-desc">'+esc(desc)+' <span class="uni">'+esc(uni||'')+'</span></span>'+impStr+'</div>'
    + avisoStr
    + '<div class="linea-fila2">'
    + '<span class="stepper"><button data-step="'+tipo+'" data-cod="'+esc(codigo)+'">−</button><input type="number" min="0" value="'+(cantidad||0)+'" data-tipo="'+tipo+'" data-cod="'+esc(codigo)+'"><button data-step="'+tipo+'" data-cod="'+esc(codigo)+'">+</button></span>'
    + '<button class="accion-btn" data-foto="'+tipo+'" data-cod="'+esc(codigo)+'">📷 <span>'+(nFotos||'')+'</span></button>'
    + (nFotos?'<button class="accion-btn" data-galeria="'+tipo+'" data-cod="'+esc(codigo)+'">🖼</button>':'')
    + '<button class="accion-btn" data-comenta="'+tipo+'" data-cod="'+esc(codigo)+'">💬</button>'
    + '<button class="accion-btn rojo" data-borrar-linea="'+tipo+'" data-cod="'+esc(codigo)+'">🗑</button>'
    + '</div>'
    + comStr
    + '</div>';
}
function aplicarTemplate(obra, idx){
  var t = DAT.templates[idx];
  if(!t) return 0;
  var n = 0;
  (t.filas||[]).forEach(function(f){
    if(buscarBaremo(f.codigo).length){
      var i = buscarLinea(obra.replanteo, f.codigo);
      if(i>=0) obra.replanteo[i].cantidad = (obra.replanteo[i].cantidad||0) + (f.cantidad||0);
      else obra.replanteo.push({codigo:f.codigo, cantidad:f.cantidad||0, comentario:''});
      n++;
    }
  });
  if(t.noEncontradas && t.noEncontradas.length){
    var txt = t.noEncontradas.length + ' partida(s) de la plantilla sin equivalente en el baremo actual';
    if(t.noEncontradas.length<=3) txt += ': ' + t.noEncontradas.slice(0,3).join(' | ');
    else txt += ' (ej.: ' + t.noEncontradas.slice(0,3).join(' | ') + '...)';
    alert(txt);
  }
  return n;
}

/* ---------------- Comentarios y galerías ---------------- */
function editarComentarioLinea(tipo, codigo){
  var lista = tipo==='partida'?app.obra.replanteo:app.obra.materiales;
  var i = buscarLinea(lista, codigo);
  if(i<0) return;
  abrirOverlay('Comentario', lista[i].comentario||'', function(txt){ guardarComentarioLinea(tipo, codigo, txt); });
}
function abrirOverlay(titulo, valor, onGuardar){
  var ov = $id('overlay');
  ov.innerHTML = '<div class="overlay" style="position:static">'
    + '<div class="caja"><h3>'+esc(titulo)+'</h3>'
    + '<textarea id="ovTexto" rows="3" style="width:100%">'+esc(valor)+'</textarea>'
    + '<div class="fila" style="margin-top:12px"><button class="boton gris" id="ovCancelar">Cancelar</button><button class="boton" id="ovGuardar">Guardar</button></div>'
    + '</div></div>';
  ov.classList.remove('hidden');
  $id('ovTexto').focus();
  $id('ovCancelar').addEventListener('click', cerrarOverlay);
  $id('ovGuardar').addEventListener('click', function(){ onGuardar($id('ovTexto').value); cerrarOverlay(); });
}
function cerrarOverlay(){ $id('overlay').classList.add('hidden'); }

/* ---------------- Fotos: galería y modal ---------------- */
function pedirFoto(tipo, codigo){
  var input = $id('inputFoto');
  input.setAttribute('data-tipo', tipo||'');
  input.setAttribute('data-cod', codigo||'');
  input.click();
}
function renderGaleria(){
  var fotos = app.fotos.slice().sort(function(a,b){ return (b.fecha||'').localeCompare(a.fecha||''); });
  var html = '';
  if(!fotos.length) html = '<div class="espacio" style="color:#9ca3af;font-size:13px">Sin fotos. Usa 📷 en cada partida o añade una general arriba.</div>';
  fotos.forEach(function(f){
    var etiq = f.partidaCodigo ? esc(f.partidaCodigo) : 'general';
    html += '<img class="foto-thumb" src="'+f.dataUrl+'" data-foto-id="'+esc(f.id)+'" title="'+etiq+'">';
  });
  $id('galeria').innerHTML = html;
  document.querySelectorAll('#galeria .foto-thumb').forEach(function(img){
    img.addEventListener('click', function(){ abrirModalFoto(img.getAttribute('data-foto-id')); });
  });
}
function abrirModalFoto(id){
  var f=null;
  for(var i=0;i<app.fotos.length;i++){ if(app.fotos[i].id===id){ f=app.fotos[i]; break; } }
  if(!f) return;
  var m = $id('modalFoto');
  var etiq = f.partidaCodigo ? 'Ligada a '+f.partidaCodigo : 'Foto general';
  m.innerHTML = '<img src="'+f.dataUrl+'">'
    + '<div class="cap">'+etiq+(f.comentario?'\n'+esc(f.comentario):'')+'</div>'
    + '<div class="acciones">'
    + '<button id="mfComenta">💬 Comentario</button>'
    + '<button id="mfElimina">🗑 Eliminar</button>'
    + '<button id="mfCierra">✕ Cerrar</button>'
    + '</div>';
  m.classList.remove('hidden');
  $id('mfComenta').addEventListener('click', function(){
    abrirOverlay('Comentario de la foto', f.comentario||'', function(txt){ guardarComentarioFoto(f.id, txt); renderGaleria(); });
  });
  $id('mfElimina').addEventListener('click', function(){
    if(confirm('¿Eliminar esta foto?')){ borrarFoto(f.id); m.classList.add('hidden'); renderPartidas(); renderGaleria(); }
  });
  $id('mfCierra').addEventListener('click', function(){ m.classList.add('hidden'); });
}
function abrirGaleria(tipo, codigo){
  var fotos = fotosDe(tipo, codigo);
  if(!fotos.length){ toast('No hay fotos de '+codigo); return; }
  var idx = 0;
  function mostrar(){
    var f = fotos[idx];
    var m = $id('modalFoto');
    m.innerHTML = '<img src="'+f.dataUrl+'">'
      + '<div class="cap">'+esc(codigo)+' '+(idx+1)+'/'+fotos.length+(f.comentario?'\n'+esc(f.comentario):'')+'</div>'
      + '<div class="acciones">'
      + (fotos.length>1?'<button id="mfPrev">←</button><button id="mfNext">→</button>':'')
      + '<button id="mfCierra">✕ Cerrar</button>'
      + '</div>';
    m.classList.remove('hidden');
    var prev=$id('mfPrev'), next=$id('mfNext');
    if(prev) prev.addEventListener('click', function(){ idx=(idx+fotos.length-1)%fotos.length; mostrar(); });
    if(next) next.addEventListener('click', function(){ idx=(idx+1)%fotos.length; mostrar(); });
    $id('mfCierra').addEventListener('click', function(){ m.classList.add('hidden'); });
  }
  mostrar();
}

/* ---------------- Documentos ---------------- */
function renderDocs(){
  var html = '';
  app.obra.documentos.forEach(function(d){
    html += '<div class="doc-item">'
      + '<div class="dn">'+esc(d.nombre||'Nota')+' <span style="font-size:11px;color:#9ca3af">'+esc(d.fecha||'')+'</span></div>'
      + (d.notas?'<div class="dn2">'+esc(d.notas)+'</div>':'')
      + '<button class="accion-btn rojo pequeno" style="margin-top:6px" data-borrar-doc="'+esc(d.id)+'">🗑</button>'
      + '</div>';
  });
  $id('listaDocs').innerHTML = html || '<div style="font-size:13px;color:#9ca3af">Sin notas todavía.</div>';
  document.querySelectorAll('[data-borrar-doc]').forEach(function(b){
    b.addEventListener('click', function(){
      var id=b.getAttribute('data-borrar-doc');
      if(confirm('¿Eliminar esta nota?')){
        app.obra.documentos = app.obra.documentos.filter(function(d){ return d.id!==id; });
        guardarObra(); renderDocs();
      }
    });
  });
}
function renderCorreo(){
  $id('cCorreo').textContent = app.obra.correo||'Sin correo de encargo adjunto.';
}

/* ---------------- Facturación ---------------- */
function renderFacturacion(){
  var o = app.obra;
  var html = '';
  o.facturacion.forEach(function(f){
    var pr = precioPartida(f.codigo);
    var imp = pr ? round2(pr.importe * f.cantidad) : 0;
    html += '<div class="li-fact">'
      + '<span class="linea-codigo">'+esc(f.codigo)+'</span>'
      + '<span style="flex:1;font-size:13px;min-width:120px">'+esc(nombrePartida(f.codigo))+'</span>'
      + '<input type="number" min="0" value="'+(f.cantidad||0)+'" data-fact-cant="'+esc(f.codigo)+'" style="width:64px">'
      + '<span style="font-size:13px;font-weight:600;width:80px;text-align:right">'+fmtEuro(imp)+'</span>'
      + '<button class="accion-btn rojo" data-fact-del="'+esc(f.codigo)+'">🗑</button>'
      + '</div>'
      + (f.comentario?'<div style="padding:0 12px 4px 12px;font-size:12px;color:#6b7280">'+esc(f.comentario)+'</div>':'');
  });
  if(!o.facturacion.length) html = '<div style="font-size:13px;color:#9ca3af;padding:4px 4px">Sin unidades de facturación. Pulsa el botón de arriba para copiar del replanteo.</div>';
  $id('listaFacturacion').innerHTML = html;
  // total
  var tot = 0;
  o.facturacion.forEach(function(f){ var pr=precioPartida(f.codigo); if(pr) tot += round2(pr.importe*f.cantidad); });
  $id('resumenFact').innerHTML = 'Total facturación: <span class="imp">'+fmtEuro(round2(tot))+'</span>';
  // eventos
  document.querySelectorAll('[data-fact-cant]').forEach(function(inp){
    inp.addEventListener('change', function(){
      var cod=inp.getAttribute('data-fact-cant');
      var i=buscarLinea(o.facturacion,cod);
      if(i>=0){ var n=parseInt(inp.value,10); o.facturacion[i].cantidad=isNaN(n)||n<0?0:n; guardarObra(); renderFacturacion(); }
    });
  });
  document.querySelectorAll('[data-fact-del]').forEach(function(b){
    b.addEventListener('click', function(){
      var cod=b.getAttribute('data-fact-del');
      o.facturacion=o.facturacion.filter(function(x){ return x.codigo!==cod; });
      guardarObra(); renderFacturacion();
    });
  });
}

/* ---------------- Historial ---------------- */
function renderHistorial(){
  var h = app.obra.historial||[];
  var html = h.slice().reverse().map(function(x){
    return '<div class="his-item"><div class="hf">'+esc(x.fecha)+'</div>'+esc(x.texto)+'</div>';
  }).join('');
  $id('listaHistorial').innerHTML = html || '<div style="font-size:13px;color:#9ca3af">Sin movimientos.</div>';
}

/* ---------------- Control Obras ---------------- */
function renderControl(){
  var o = app.obra;
  var nPartidas = (o.replanteo||[]).length;
  var nMateriales = (o.materiales||[]).length;
  var nFotos = app.fotos.length;
  var nDocs = (o.documentos||[]).length;
  var tot = totalValoracion(o);
  var factTot = 0;
  (o.facturacion||[]).forEach(function(f){ var pr=precioPartida(f.codigo); if(pr) factTot += round2(pr.importe*f.cantidad); });
  var html = ''
    + '<div class="ctrl-row"><span class="ctrl-label">LCL</span><span class="ctrl-valor">'+esc(o.lcl||'-')+'</span></div>'
    + '<div class="ctrl-row"><span class="ctrl-label">Dirección</span><span class="ctrl-valor">'+esc(o.direccion||'-')+'</span></div>'
    + '<div class="ctrl-row"><span class="ctrl-label">Municipio</span><span class="ctrl-valor">'+esc(o.municipio||'-')+'</span></div>'
    + '<div class="ctrl-row"><span class="ctrl-label">Estado</span><span class="ctrl-valor"><span class="estado-chip '+claseEstado(o.estado)+'">'+esc(o.estado||'Alta')+'</span></span></div>'
    + '<div class="ctrl-row"><span class="ctrl-label">Fecha alta</span><span class="ctrl-valor">'+esc(o.fechaAlta||'-')+'</span></div>'
    + '<div class="ctrl-row"><span class="ctrl-label">Zonas</span><span class="ctrl-valor">'+esc((o.zonaAereo||'')+(o.zonaSubt?' / '+o.zonaSubt:'')||'-')+'</span></div>'
    + '<div class="ctrl-row"><span class="ctrl-label">Valoración</span><span class="ctrl-valor" style="color:var(--verde)">'+fmtEuro(tot)+'</span></div>'
    + '<div class="ctrl-row"><span class="ctrl-label">Facturación</span><span class="ctrl-valor">'+fmtEuro(factTot)+'</span></div>'
    + '<div class="ctrl-row"><span class="ctrl-label">Partidas</span><span class="ctrl-valor">'+nPartidas+'</span></div>'
    + '<div class="ctrl-row"><span class="ctrl-label">Materiales</span><span class="ctrl-valor">'+nMateriales+'</span></div>'
    + '<div class="ctrl-row"><span class="ctrl-label">Fotos</span><span class="ctrl-valor">'+nFotos+'</span></div>'
    + '<div class="ctrl-row"><span class="ctrl-label">Notas</span><span class="ctrl-valor">'+nDocs+'</span></div>'
    + '<div class="ctrl-row"><span class="ctrl-label">Movimientos</span><span class="ctrl-valor">'+(o.historial||[]).length+'</span></div>';
  $id('controlResumen').innerHTML = html;
  renderHistorial();
}

/* ---------------- Calendario ---------------- */
var _calYear, _calMonth;
function initCalendario(){
  var hoy = new Date();
  _calYear = hoy.getFullYear();
  _calMonth = hoy.getMonth();
}
function renderCalendario(){
  if(!_calYear) initCalendario();
  var meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  $id('calTitulo').textContent = meses[_calMonth]+' '+_calYear;
  var primerDia = new Date(_calYear, _calMonth, 1).getDay();
  var diasEnMes = new Date(_calYear, _calMonth+1, 0).getDate();
  var hoy = new Date();
  var esHoy = function(d){ return d===hoy.getDate() && _calMonth===hoy.getMonth() && _calYear===hoy.getFullYear(); };
  // Eventos del historial este mes
  var eventos = {};
  (app.obra.historial||[]).forEach(function(x){
    var parts = x.fecha.split(' ');
    var dp = (parts[0]||'').split('/');
    if(dp.length>=3){
      var dy=parseInt(dp[2],10), dm=parseInt(dp[1],10)-1, dd=parseInt(dp[0],10);
      if(dm===_calMonth && dy===_calYear){
        if(!eventos[dd]) eventos[dd]=[];
        var tipo = 'otro';
        if(/fase/i.test(x.texto)) tipo='fase';
        else if(/alta/i.test(x.texto)) tipo='alta';
        else if(/parada/i.test(x.texto)) tipo='parada';
        eventos[dd].push({texto:x.texto, tipo:tipo});
      }
    }
  });
  var cab = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  var html = cab.map(function(d){ return '<div class="cal-dia-cab">'+d+'</div>'; }).join('');
  // Días vacíos al inicio (lunes=0)
  var offset = (primerDia + 6) % 7;
  for(var e=0;e<offset;e++) html += '<div class="cal-dia vacio"></div>';
  for(var d=1;d<=diasEnMes;d++){
    var cls = esHoy(d)?'cal-dia hoy':'cal-dia';
    var evHtml = '';
    if(eventos[d]){
      eventos[d].forEach(function(ev){
        evHtml += '<div class="cal-ev '+ev.tipo+'" title="'+esc(ev.texto)+'">'+esc(ev.texto)+'</div>';
      });
    }
    html += '<div class="'+cls+'"><div class="cal-num">'+d+'</div>'+evHtml+'</div>';
  }
  $id('calGrid').innerHTML = html;
}

/* ---------------- Exportación: ZIP (xlsx + pdf + fotos) ---------------- */
function crearWorkbook(o){
  var wb = XLSX.utils.book_new();
  var cab = [
    ['VALORACIÓN DE OBRA — EIFFAGE ENERGÍA / MULTISERVICIO ARAGÓN SUR'],
    [''],
    ['LCL', o.lcl],
    ['Dirección', o.direccion],
    ['Municipio', o.municipio],
    ['Zona aéreo', o.zonaAereo],
    ['Zona subterráneo', o.zonaSubt],
    ['Estado', o.estado],
    ['Fecha de alta', o.fechaAlta],
    ['Fecha de exportación', new Date().toLocaleString('es-ES')]
  ];
  var wsCab = XLSX.utils.aoa_to_sheet(cab);
  wsCab['!cols']=[{wch:22},{wch:60}];

  var pres = [['CÓDIGO','DESCRIPCIÓN','UNIDAD','PUNTOS','CANTIDAD','PRECIO PUNTO (€)','IMPORTE (€)','COMENTARIO']];
  var totPres = 0;
  o.replanteo.forEach(function(r){
    var p = precioPartida(r.codigo);
    var imp = p?round2(p.importe*r.cantidad):0;
    totPres += imp;
    pres.push([r.codigo, p?p.partida.d:'', p?p.partida.u:'', p?p.partida.p:0, r.cantidad, p?p.valorPunto:0, imp, r.comentario||'']);
  });
  pres.push(['','','','','TOTAL PRESTACIONES', '', round2(totPres), '']);
  var wsPres = XLSX.utils.aoa_to_sheet(pres);
  wsPres['!cols']=[{wch:16},{wch:60},{wch:8},{wch:8},{wch:10},{wch:16},{wch:13},{wch:35}];

  var mat = [['CÓDIGO','DESCRIPCIÓN','UNIDAD','CANTIDAD','COMENTARIO']];
  o.materiales.forEach(function(m){
    var mt = null;
    for(var i=0;i<DAT.materiales.length;i++){ if(DAT.materiales[i].c===m.codigo){ mt=DAT.materiales[i]; break; } }
    mat.push([m.codigo, mt?mt.d:'', mt?mt.u:'', m.cantidad, m.comentario||'']);
  });
  var wsMat = XLSX.utils.aoa_to_sheet(mat);
  wsMat['!cols']=[{wch:16},{wch:60},{wch:8},{wch:10},{wch:35}];

  var res = [['FAMILIA','ESPECIALIDAD','PUNTOS','CANTIDAD','IMPORTE (€)']];
  var mapa = {};
  o.replanteo.forEach(function(r){
    var p = precioPartida(r.codigo);
    if(!p) return;
    var k = (p.partida.f||'SIN FAMILIA')+'|'+(p.partida.e||'');
    mapa[k]=mapa[k]||{fam:p.partida.f||'SIN FAMILIA',esp:p.partida.e||'',puntos:0,cant:0,imp:0};
    mapa[k].puntos += (p.partida.p||0)*r.cantidad;
    mapa[k].cant += r.cantidad;
    mapa[k].imp += round2(p.importe*r.cantidad);
  });
  var totPuntos=0, totCant=0, totImp=0;
  Object.keys(mapa).forEach(function(k){
    res.push([mapa[k].fam, mapa[k].esp, round2(mapa[k].puntos), mapa[k].cant, round2(mapa[k].imp)]);
    totPuntos+=mapa[k].puntos; totCant+=mapa[k].cant; totImp+=mapa[k].imp;
  });
  res.push(['TOTAL','', round2(totPuntos), totCant, round2(totImp)]);
  var wsRes = XLSX.utils.aoa_to_sheet(res);
  wsRes['!cols']=[{wch:30},{wch:18},{wch:12},{wch:10},{wch:13}];

  XLSX.utils.book_append_sheet(wb, wsCab, 'CABECERA');
  XLSX.utils.book_append_sheet(wb, wsPres, 'PRESTACIONES');
  XLSX.utils.book_append_sheet(wb, wsMat, 'MATERIALES');
  XLSX.utils.book_append_sheet(wb, wsRes, 'RESUMEN');
  return wb;
}

function crearPDF(o){
  return new Promise(function(resolve){
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF();
    var y = 16;
    var margen = 14;
    function linea(){
      if(y > 270){ doc.addPage(); y = 16; }
    }
    doc.setFont('helvetica','bold'); doc.setFontSize(14);
    doc.text('JUSTIFICACIÓN DE OBRA', margen, y); y+=7;
    doc.setFont('helvetica','normal'); doc.setFontSize(10);
    doc.text('LCL: '+o.lcl, margen, y); y+=5;
    doc.text('Dirección: '+(o.direccion||'-'), margen, y); y+=5;
    doc.text('Municipio: '+(o.municipio||'-'), margen, y); y+=5;
    doc.text('Estado: '+(o.estado||'-')+'    Fecha alta: '+(o.fechaAlta||'-'), margen, y); y+=9;

    function seccion(titulo){
      linea(); doc.setFont('helvetica','bold'); doc.setFontSize(12);
      doc.setTextColor(26,77,143);
      doc.text(titulo, margen, y); y+=6;
      doc.setTextColor(0); doc.setFont('helvetica','normal'); doc.setFontSize(10);
    }
    function bloque(codigo, desc, cant, imp, comentario, foto){
      linea();
      doc.setFont('helvetica','bold'); doc.setFontSize(10);
      doc.text(codigo + '   x ' + fmtNum(cant) + '   ' + fmtEuro(imp), margen, y); y+=5;
      doc.setFont('helvetica','normal'); doc.setFontSize(9);
      var lines = doc.splitTextToSize(desc, 175);
      doc.text(lines, margen, y); y += lines.length*4 + 2;
      if(comentario){
        var cl = doc.splitTextToSize('Comentario: '+comentario, 175);
        doc.setTextColor(107,114,128); doc.text(cl, margen, y); doc.setTextColor(0);
        y += cl.length*4 + 2;
      }
      if(foto){
        if(y > 200){ doc.addPage(); y = 16; }
        doc.addImage(foto, 'JPEG', margen, y, 74, 55);
        y += 60;
      } else {
        doc.setTextColor(220,38,38);
        doc.text('Sin foto adjunta', margen, y); y+=5;
        doc.setTextColor(0);
      }
      y += 3;
    }

    seccion('PRESTACIONES');
    o.replanteo.forEach(function(r){
      var p = precioPartida(r.codigo);
      var imp = p?round2(p.importe*r.cantidad):0;
      var fotos = fotosDe('partida', r.codigo);
      bloque(r.codigo, p?p.partida.d:'', r.cantidad, imp, r.comentario, fotos.length?fotos[0].dataUrl:null);
    });
    var totP = 0;
    o.replanteo.forEach(function(r){ var p=precioPartida(r.codigo); if(p) totP += round2(p.importe*r.cantidad); });
    linea();
    doc.setFont('helvetica','bold'); doc.setFontSize(11);
    doc.text('TOTAL PRESTACIONES: '+fmtEuro(round2(totP)), margen, y); y+=8;
    doc.setFont('helvetica','normal'); doc.setFontSize(10);

    seccion('MATERIALES');
    o.materiales.forEach(function(m){
      var mt = null;
      for(var i=0;i<DAT.materiales.length;i++){ if(DAT.materiales[i].c===m.codigo){ mt=DAT.materiales[i]; break; } }
      var fotos = fotosDe('material', m.codigo);
      bloque(m.codigo, mt?mt.d:'', m.cantidad, 0, m.comentario, fotos.length?fotos[0].dataUrl:null);
    });
    doc.setFont('helvetica','bold'); doc.setFontSize(11);
    linea();
    doc.text('Materiales facturados aparte por Endesa. Los importes corresponden a PRESTACIONES.', margen, y); y+=8;
    doc.setFontSize(9); doc.setTextColor(107,114,128);
    doc.text('Generado con Gestor de Obras MT/BT — '+new Date().toLocaleString('es-ES'), margen, y);
    resolve(doc);
  });
}

async function buildZipBlob(){
  var o = app.obra;
  var zip = new JSZip();
  var fz = zip.folder('fotos');
  app.fotos.forEach(function(ph,i){
    var base = (ph.partidaCodigo||'general').replace(/[^\w\-\u00C0-\uFFFF]+/g,'_');
    fz.file(base+'_'+(i+1)+'.jpg', dataUrlToBlob(ph.dataUrl));
  });
  var wb = crearWorkbook(o);
  zip.file('Valoracion_LCL_'+(o.lcl||'obra')+'.xlsx', XLSX.write(wb,{type:'array',bookType:'xlsx'}));
  var pdf = await crearPDF(o);
  zip.file('Justificacion_LCL_'+(o.lcl||'obra')+'.pdf', pdf.output('blob'));
  return await zip.generateAsync({type:'blob'});
}
function nombreZip(){ return 'LCL_'+(app.obra.lcl||'obra')+'_documentacion.zip'; }

/* ---------------- Compartir ZIP ---------------- */
async function compartirZip(){
  var blob = await buildZipBlob();
  var nombre = nombreZip();
  if(navigator.canShare && navigator.canShare({files:[new File([blob],nombre,{type:'application/zip'})]})){
    try{
      await navigator.share({title:'Valoración '+app.obra.lcl, files:[new File([blob],nombre,{type:'application/zip'})]});
      toast('ZIP compartido');
      return;
    }catch(e){ if(e.name==='AbortError') return; }
  }
  // Motivos por los que puede fallar share
  var motivo = '';
  if(location.protocol==='file:') motivo='El archivo está abierto como file:// — el compartir requiere HTTPS real (publica la web).';
  else if(!window.isSecureContext) motivo='Contexto no seguro (sin HTTPS). Requiere HTTPS para compartir.';
  else if(!navigator.share) motivo='Este navegador no soporta Web Share.';
  else motivo='No se pudo compartir en este dispositivo/navegador.';
  descargar(blob, nombre);
  toast(motivo);
}

/* ---------------- Inicio ---------------- */
function actualizarIndicador(b){
  if(b==='setup'){ $id('txtSync').textContent='Config'; $id('dotSync').className='dot sync'; }
}

async function iniciar(){
  diag('app inicia: online='+navigator.onLine+' SW-control='+(navigator.serviceWorker&&navigator.serviceWorker.controller?'si':'no'));
  // registro PWA
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(function(){}); }
  var b = await STORAGE.init();
  app.obras = await STORAGE.get('index') || [];
  // banner de setup si falla la nube
  if(window.CONFIG && window.CONFIG.supabaseUrl && b==='idb'){
    var esTablaFalta = STORAGE.supabaseError && /PGRST205/i.test(String(STORAGE.supabaseError && STORAGE.supabaseError.message || STORAGE.supabaseError));
    var banner = $id('setupBanner');
    if(esTablaFalta){
      var sql = 'create table if not exists public.kv (key text primary key, value jsonb not null default \'{}\'::jsonb, updated_at timestamptz not null default now());\nalter table public.kv enable row level security;\ncreate policy "acceso_abierto" on public.kv for all using (true) with check (true);';
      banner.innerHTML = '⚠ La tabla de la nube no está creada. Abre <b>'+esc(window.CONFIG.supabaseUrl)+'</b> → SQL Editor → pega:<pre>'+esc(sql)+'</pre><button class="boton pequeno" onclick="location.reload()">Ya la he creado, recargar</button>';
      banner.classList.remove('hidden');
      actualizarIndicador('setup');
    } else {
      banner.innerHTML = '⚠ Sin conexión con la nube. Funcionando en <b>modo local</b>: los datos quedan guardados en este dispositivo y no se comparten hasta reconectar.';
      banner.classList.remove('hidden');
    }
  }
  if(!DATOS_CARGADOS){
    $id('setupBanner').innerHTML = '⚠ Catálogos vacíos. Abre <b>convertidor.html</b>, arrastra los Excel y sustituye <b>data.js</b>.';
    $id('setupBanner').classList.remove('hidden');
  }
  renderLista();
  llenarTemplates();

  // Mostrar versión
  if(window.CONFIG && CONFIG.appVersion){ var ev=$id('appVersion'); if(ev) ev.textContent='v'+CONFIG.appVersion; }

  // Registro de diagnóstico disponible en consola: window.__DIAG

  // eventos globales
  window.addEventListener('online', function(){ app.online=true; STORAGE.flushSync(); });
  window.addEventListener('offline', function(){ app.online=false; });

  $id('buscadorObras').addEventListener('input', renderLista);
  $id('btnNuevaObra').addEventListener('click', abrirAlta);
  $id('btnVolver').addEventListener('click', function(){
    app.vista='lista';
    app.obra=null;
    $id('vistaDetalle').classList.add('hidden');
    $id('vistaAlta').classList.add('hidden');
    $id('vistaLista').classList.remove('hidden');
    $id('btnVolver').classList.add('hidden');
    $id('btnNuevaObra').classList.remove('hidden');
    $id('tituloCab').textContent='Gestor de Obras MT/BT';
    if(location.hash) history.replaceState(null,'',location.pathname+location.search);
    renderLista();
  });
  $id('listaObras').addEventListener('click', function(e){
    var b=e.target.closest('[data-borrar]');
    if(b){ e.stopPropagation(); var id=b.getAttribute('data-borrar'); if(confirm('¿Eliminar la obra y sus fotos?')){ eliminarObra(id); renderLista(); } return; }
    var a=e.target.closest('[data-abrir]');
    if(a){ var oid=a.getAttribute('data-abrir'); cargarObra(oid).then(function(ok){ if(ok) abrirDetalle(); else toast('No se pudo cargar la obra'); }); }
  });

  // alta
  $id('fMunicipio').addEventListener('change', function(){ rellenarMunicipio(this.value); });
  $id('fMunicipio').addEventListener('blur', function(){ rellenarMunicipio(this.value); });
  $id('btnCancelarAlta').addEventListener('click', function(){
    app.vista='lista';
    $id('vistaAlta').classList.add('hidden');
    $id('vistaLista').classList.remove('hidden');
    $id('btnNuevaObra').classList.remove('hidden');
    $id('tituloCab').textContent='Gestor de Obras MT/BT';
  });
  $id('btnGuardarAlta').addEventListener('click', crearObra);

  // tabs
  $id('tabs').addEventListener('click', function(e){
    var b=e.target.closest('button'); if(!b) return;
    app.tab = b.getAttribute('data-tab');
    renderTabs();
    if(app.tab==='fotos') renderGaleria();
    if(app.tab==='partidas') renderPartidas();
    if(app.tab==='facturacion') renderFacturacion();
    if(app.tab==='documentos') renderDocs();
    if(app.tab==='control') renderControl();
    if(app.tab==='calendario') renderCalendario();
  });

  // filtros de búsqueda
  renderFiltros();
  $id('filtrosBusqueda').addEventListener('click', function(e){
    var chip = e.target.closest('[data-filtro]');
    if(!chip) return;
    app.busquedaFiltro = chip.getAttribute('data-filtro');
    renderFiltros();
    renderResultados();
  });

  // buscador de partidas
  var _blurTimer = null;
  $id('buscarPartida').addEventListener('input', function(){ app.busquedaPartida=this.value; renderResultados(); });
  $id('buscarPartida').addEventListener('focus', function(){ clearTimeout(_blurTimer); if(app.busquedaPartida.trim() || app.busquedaFiltro) renderResultados(); });
  $id('buscarPartida').addEventListener('blur', function(){ _blurTimer=setTimeout(function(){ $id('resultadosBusqueda').classList.add('hidden'); },200); });
  $id('resultadosBusqueda').addEventListener('mousedown', function(){ clearTimeout(_blurTimer); });
  $id('resultadosBusqueda').addEventListener('click', function(e){
    var addBtn = e.target.closest('.ri-add');
    if(addBtn){
      e.preventDefault();
      var tipo = addBtn.getAttribute('data-add');
      var cod = addBtn.getAttribute('data-cod');
      var item = addBtn.closest('.resultado-item');
      var cantInput = item ? item.querySelector('.ri-cant') : null;
      var cant = cantInput ? parseInt(cantInput.value,10) : 1;
      if(isNaN(cant) || cant < 1) cant = 1;
      anadirLineaCant(tipo, cod, cant);
      renderResultados();
      toast('Añadido × '+cant);
      return;
    }
  });
  // templates en partidas
  $id('btnCargarTemplate').addEventListener('click', function(){
    var idx = $id('selectTemplate').value;
    if(idx===''){ toast('Elige una plantilla'); return; }
    var n = aplicarTemplate(app.obra, parseInt(idx,10));
    addHistorial('Cargada valoración tipo');
    guardarObra();
    renderPartidas();
    toast(n+' partidas añadidas');
  });

  // calendario navegación
  $id('calPrev').addEventListener('click', function(){ _calMonth--; if(_calMonth<0){_calMonth=11;_calYear--;} renderCalendario(); });
  $id('calNext').addEventListener('click', function(){ _calMonth++; if(_calMonth>11){_calMonth=0;_calYear++;} renderCalendario(); });
  initCalendario();

  // fotos
  $id('btnFotoGeneral').addEventListener('click', function(){ pedirFoto('general', null); });
  $id('inputFoto').addEventListener('change', function(){
    var f = this.files[0]; if(!f) return;
    var tipo = this.getAttribute('data-tipo')||'general';
    var cod = this.getAttribute('data-cod');
    comprimirImagen(f, 1000, 0.6).then(function(r){
      addFoto(r.dataUrl, r.width, r.height, tipo==='general'?'general':tipo, tipo==='general'?null:cod);
      toast('Foto añadida');
      this.value='';
      if(app.tab==='partidas') renderPartidas();
      if(app.tab==='fotos') renderGaleria();
      if(app.tab==='facturacion') renderFacturacion();
    }.bind(this)).catch(function(){ toast('No se pudo leer la imagen'); });
  });

  // documentos
  $id('btnEditarCorreo').addEventListener('click', function(){
    abrirOverlay('Correo de encargo', app.obra.correo||'', function(txt){ app.obra.correo=txt; guardarObra(); renderCorreo(); });
  });
  $id('btnAddDoc').addEventListener('click', function(){
    var nom = $id('docNombre').value.trim()||'Nota';
    var notas = $id('docNotas').value;
    app.obra.documentos.push({id:uid(), nombre:nom, notas:notas, fecha:ahora()});
    $id('docNombre').value=''; $id('docNotas').value='';
    guardarObra(); renderDocs();
    toast('Nota añadida');
  });

  // facturación
  $id('btnCopiarReplanteo').addEventListener('click', function(){
    if(!app.obra.replanteo.length){ toast('El replanteo está vacío'); return; }
    app.obra.facturacion = app.obra.replanteo.map(function(r){ return {codigo:r.codigo, cantidad:r.cantidad, comentario:r.comentario}; });
    addHistorial('Cantidades de facturación copiadas del replanteo');
    guardarObra(); renderFacturacion();
    toast('Copiado del replanteo');
  });

  // exportación
  $id('btnExportarZip').addEventListener('click', async function(){
    this.disabled=true; this.textContent='Generando…';
    try{
      var blob = await buildZipBlob();
      descargar(blob, nombreZip());
      toast('ZIP generado');
    }catch(e){ console.error(e); toast('Error generando el ZIP'); }
    this.disabled=false; this.textContent='📦 Exportar ZIP';
  });
  $id('btnCompartirZip').addEventListener('click', compartirZip);

  // instalación PWA
  window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); app.deferredPrompt=e; app.instalable=true; });
  $id('btnInstalarApp').addEventListener('click', function(){
    if(app.deferredPrompt){ app.deferredPrompt.prompt(); return; }
    if(app.instalable){ toast('Pulsa en el menú del navegador → "Instalar aplicación"'); return; }
    toast('En móvil: menú ⋮ → Añadir a pantalla de inicio');
  });

  // cerrar modal foto al hacer clic fuera
  $id('modalFoto').addEventListener('click', function(e){ if(e.target===this) this.classList.add('hidden'); });
}
document.addEventListener('DOMContentLoaded', iniciar);

})();
