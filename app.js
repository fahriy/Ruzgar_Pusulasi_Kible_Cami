(() => {
  "use strict";

  const COLORS = ["#ff3f67", "#46a9ff", "#54df83", "#b276ff", "#ffad45", "#25d4c7", "#f15ec0"];
  const STORAGE_KEY = "harita-pusula-v3-targets";

  let map;
  let osmLayer;
  let satelliteLayer;
  let activeBaseLayer;
  let satelliteOn = false;

  let userMarker = null;
  let accuracyCircle = null;
  let currentPosition = null;
  let gpsPosition = null;
  let manualLocation = false;

  let deviceHeading = null;
  let targets = [];
  let activeId = null;
  let nextId = 1;
  let watchId = null;

  let windOn = false;
  let windLayer = null;
  let windAbort = null;
  let windTimer = null;
  let windInterval = null;

  const $ = id => document.getElementById(id);
  const els = {
    locationStatus: $("locationStatus"),
    accuracyStatus: $("accuracyStatus"),
    orientationStatus: $("orientationStatus"),
    windStatus: $("windStatus"),
    orientationBtn: $("orientationBtn"),
    recenterBtn: $("recenterBtn"),
    manualLocationBtn: $("manualLocationBtn"),
    satelliteBtn: $("satelliteBtn"),
    windBtn: $("windBtn"),
    windLegend: $("windLegend"),
    manualBanner: $("manualBanner"),
    finishManualBtn: $("finishManualBtn"),
    useGpsBtn: $("useGpsBtn"),
    followToggle: $("followToggle"),
    clearBtn: $("clearBtn"),
    targets: $("targets"),
    emptyState: $("emptyState"),
    activeTargetName: $("activeTargetName"),
    activeDistance: $("activeDistance"),
    targetBearing: $("targetBearing"),
    deviceBearing: $("deviceBearing"),
    turnHint: $("turnHint"),
    needle: $("needle"),
    centerWind: $("centerWind"),
    centerWindArrow: $("centerWindArrow"),
    centerWindSpeed: $("centerWindSpeed"),
    centerWindDirection: $("centerWindDirection"),
    centerWindTop: $("centerWindTop"),
    centerWindBottom: $("centerWindBottom")
  };

  function initMap() {
    map = L.map("map", {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true
    }).setView([38.4237, 27.1428], 14);

    osmLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      minZoom: 2,
      maxZoom: 19,
      keepBuffer: 5,
      updateWhenIdle: false,
      detectRetina: false,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> katkıcıları'
    });

    satelliteLayer = L.tileLayer(
      "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        minZoom: 2,
        maxZoom: 19,
        keepBuffer: 4,
        attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics, GIS User Community'
      }
    );

    osmLayer.addTo(map);
    activeBaseLayer = osmLayer;

    map.on("click", e => {
      if (!manualLocation) addTarget(e.latlng.lat, e.latlng.lng);
    });

    map.on("moveend zoomend", () => {
      if (windOn) scheduleWindRefresh();
    });

    setTimeout(() => map.invalidateSize(true), 60);
    setTimeout(() => map.invalidateSize(true), 500);
    window.addEventListener("resize", () => map.invalidateSize(false));

    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(() => map.invalidateSize(false));
      ro.observe(document.querySelector(".map-wrap"));
    }

    renderAllTargets();
    startGps();
    renderTargetsList();
    updateCompass();
  }

  function loadTargets() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(raw)) return;

      targets = raw
        .filter(x => Number.isFinite(x?.lat) && Number.isFinite(x?.lng))
        .slice(0, 50)
        .map((x, i) => ({
          id: Number.isInteger(x.id) ? x.id : i + 1,
          lat: x.lat,
          lng: x.lng,
          name: typeof x.name === "string" ? x.name : `Hedef ${i + 1}`,
          color: typeof x.color === "string" ? x.color : COLORS[i % COLORS.length],
          line: null,
          marker: null
        }));

      nextId = targets.reduce((m, x) => Math.max(m, x.id + 1), 1);
      activeId = targets[0]?.id ?? null;
    } catch (_) {}
  }

  function saveTargets() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(targets.map(({id,lat,lng,name,color}) => ({id,lat,lng,name,color})))
    );
  }

  function startGps() {
    if (!navigator.geolocation) {
      els.locationStatus.textContent = "Konum özelliği desteklenmiyor";
      return;
    }

    els.locationStatus.textContent = "Konum izni bekleniyor…";

    watchId = navigator.geolocation.watchPosition(
      pos => {
        gpsPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null
        };

        if (!manualLocation) {
          currentPosition = {...gpsPosition};
          updateLocationUI();
          updateUserMarker();
          updateTargetLines();
          renderTargetsList();
          updateCompass();
          if (windOn) scheduleWindRefresh();

          if (els.followToggle.checked) {
            map.panTo([currentPosition.lat, currentPosition.lng]);
          }
        } else {
          updateAccuracyOnly();
        }
      },
      err => {
        const text = {
          1: "Konum izni verilmedi",
          2: "Konum alınamıyor",
          3: "Konum zaman aşımı"
        }[err.code] || "Konum hatası";
        els.locationStatus.textContent = text;
        els.accuracyStatus.textContent = "—";
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  }

  function updateLocationUI() {
    if (!currentPosition) return;
    els.locationStatus.textContent =
      `${currentPosition.lat.toFixed(6)}, ${currentPosition.lng.toFixed(6)}${manualLocation ? " (elle)" : ""}`;
    updateAccuracyOnly();
  }

  function updateAccuracyOnly() {
    if (manualLocation) {
      els.accuracyStatus.textContent = "Elle ayarlanmış";
      return;
    }
    const a = gpsPosition?.accuracy;
    if (!Number.isFinite(a)) {
      els.accuracyStatus.textContent = "Bilinmiyor";
      return;
    }
    const q = a <= 10 ? "çok iyi" : a <= 25 ? "iyi" : a <= 75 ? "orta" : "düşük";
    els.accuracyStatus.textContent = `±${Math.round(a)} m (${q})`;
  }

  function makeLocationIcon() {
    return L.divIcon({
      className: "",
      html: '<div class="location-pin"></div>',
      iconSize: [22,22],
      iconAnchor: [11,11]
    });
  }

  function updateUserMarker() {
    if (!currentPosition) return;
    const ll = [currentPosition.lat, currentPosition.lng];

    if (!userMarker) {
      userMarker = L.marker(ll, {
        icon: makeLocationIcon(),
        draggable: manualLocation,
        zIndexOffset: 1000
      }).addTo(map);

      userMarker.on("drag", e => {
        if (!manualLocation) return;
        const p = e.target.getLatLng();
        currentPosition = {lat:p.lat,lng:p.lng,accuracy:0};
        updateLocationUI();
        updateTargetLines();
        renderTargetsList();
        updateCompass();
      });

      accuracyCircle = L.circle(ll, {
        radius: radiusForAccuracy(),
        color: "#1769e0",
        weight: 1,
        fillColor: "#1769e0",
        fillOpacity: .08,
        interactive: false
      }).addTo(map);

      map.setView(ll, accuracyZoom());
    } else {
      userMarker.setLatLng(ll);
      manualLocation ? userMarker.dragging.enable() : userMarker.dragging.disable();
      accuracyCircle.setLatLng(ll);
      accuracyCircle.setRadius(radiusForAccuracy());
    }
  }

  function radiusForAccuracy() {
    if (manualLocation) return 0;
    const a = gpsPosition?.accuracy;
    return Number.isFinite(a) ? Math.max(3,Math.min(a,1000)) : 20;
  }

  function accuracyZoom() {
    const a = gpsPosition?.accuracy;
    if (!Number.isFinite(a)) return 16;
    if (a <= 10) return 18;
    if (a <= 30) return 17;
    if (a <= 100) return 16;
    if (a <= 500) return 14;
    return 12;
  }

  function targetIcon(color) {
    return L.divIcon({
      className: "",
      html: `<div class="target-drag-pin" style="--pin-color:${color}"></div>`,
      iconSize: [24,24],
      iconAnchor: [12,12]
    });
  }

  function createTargetLayers(t) {
    const start = currentPosition ? [currentPosition.lat,currentPosition.lng] : [t.lat,t.lng];

    t.line = L.polyline([start,[t.lat,t.lng]], {
      color:t.color,
      weight:4,
      opacity:.92
    }).addTo(map);

    t.marker = L.marker([t.lat,t.lng], {
      draggable:true,
      icon:targetIcon(t.color),
      zIndexOffset:500
    }).addTo(map);

    const activate = () => {
      activeId = t.id;
      renderTargetsList();
      updateCompass();
    };

    t.line.on("click", activate);
    t.marker.on("click", activate);

    t.marker.on("dragstart", () => {
      activeId = t.id;
      renderTargetsList();
    });

    t.marker.on("drag", e => {
      const p = e.target.getLatLng();
      t.lat = p.lat;
      t.lng = p.lng;
      const startNow = currentPosition
        ? [currentPosition.lat,currentPosition.lng]
        : [t.lat,t.lng];
      t.line.setLatLngs([startNow,[t.lat,t.lng]]);
      renderTargetsList();
      updateCompass();
    });

    t.marker.on("dragend", () => {
      saveTargets();
      renderTargetsList();
      updateCompass();
      if (windOn) refreshWind();
    });
  }

  function renderAllTargets() {
    for (const t of targets) {
      if (!t.line || !t.marker) createTargetLayers(t);
    }
  }

  function updateTargetLines() {
    if (!currentPosition) return;
    for (const t of targets) {
      if (!t.line || !t.marker) createTargetLayers(t);
      t.line.setLatLngs([
        [currentPosition.lat,currentPosition.lng],
        [t.lat,t.lng]
      ]);
    }
  }

  function addTarget(lat,lng) {
    const id = nextId++;
    const t = {
      id,lat,lng,
      name:`Hedef ${id}`,
      color:COLORS[(id-1)%COLORS.length],
      line:null,marker:null
    };
    targets.push(t);
    activeId=id;
    createTargetLayers(t);
    saveTargets();
    renderTargetsList();
    updateCompass();
    if (windOn) refreshWind();
  }

  function removeTarget(id) {
    const i=targets.findIndex(t=>t.id===id);
    if (i<0) return;
    const t=targets[i];
    if (t.line) map.removeLayer(t.line);
    if (t.marker) map.removeLayer(t.marker);
    targets.splice(i,1);
    if (activeId===id) activeId=targets[0]?.id??null;
    saveTargets();
    renderTargetsList();
    updateCompass();
    if (windOn) refreshWind();
  }

  function clearTargets() {
    for (const t of targets) {
      if (t.line) map.removeLayer(t.line);
      if (t.marker) map.removeLayer(t.marker);
    }
    targets=[];
    activeId=null;
    saveTargets();
    renderTargetsList();
    updateCompass();
    if (windOn) refreshWind();
  }

  function renderTargetsList() {
    els.targets.innerHTML="";
    els.emptyState.hidden=targets.length>0;

    for (const t of targets) {
      const row=document.createElement("div");
      row.className="target-row"+(t.id===activeId?" active":"");

      const dot=document.createElement("div");
      dot.className="color-dot";
      dot.style.background=t.color;

      const main=document.createElement("button");
      main.type="button";
      main.className="target-main";

      const title=document.createElement("strong");
      title.textContent=t.name;

      const meta=document.createElement("span");
      const d=currentPosition?formatDistance(distanceMeters(currentPosition,t)):"konum bekleniyor";
      const b=currentPosition?`${Math.round(bearingDegrees(currentPosition,t))}°`:"—";
      meta.textContent=`${d} · ${b} · ${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}`;

      main.append(title,meta);
      main.addEventListener("click",()=>{
        activeId=t.id;
        renderTargetsList();
        updateCompass();
        map.panTo([t.lat,t.lng]);
      });

      const del=document.createElement("button");
      del.type="button";
      del.className="delete-btn";
      del.textContent="×";
      del.addEventListener("click",()=>removeTarget(t.id));

      row.append(dot,main,del);
      els.targets.appendChild(row);
    }
  }

  function setManualMode(enable) {
    manualLocation=enable;
    els.manualBanner.hidden=!enable;

    if (enable) {
      els.followToggle.checked=false;
      if (!currentPosition) {
        const c=map.getCenter();
        currentPosition={lat:c.lat,lng:c.lng,accuracy:0};
      }
    } else if (gpsPosition) {
      currentPosition={...gpsPosition};
    }

    updateLocationUI();
    updateUserMarker();
    updateTargetLines();
    renderTargetsList();
    updateCompass();
  }

  function toggleSatellite() {
    satelliteOn=!satelliteOn;

    if (activeBaseLayer) map.removeLayer(activeBaseLayer);
    activeBaseLayer=satelliteOn?satelliteLayer:osmLayer;
    activeBaseLayer.addTo(map);
    activeBaseLayer.bringToBack();

    document.body.classList.toggle("satellite-active",satelliteOn);
    els.satelliteBtn.querySelector("span:last-child").textContent=satelliteOn?"Normal Haritaya Dön":"Uyduyu Aç";

    // tile katmanı değişince boyutu tekrar hesapla
    setTimeout(()=>map.invalidateSize(false),100);
  }

  function scheduleWindRefresh() {
    clearTimeout(windTimer);
    windTimer=setTimeout(refreshWind,500);
  }

  function stopWindInterval() {
    if (windInterval) {
      clearInterval(windInterval);
      windInterval=null;
    }
  }

  function startWindInterval() {
    stopWindInterval();
    windInterval=setInterval(() => {
      if (windOn) refreshWind();
    }, 5 * 1000);
  }

  function clearWindLayer() {
    if (windAbort) {
      windAbort.abort();
      windAbort=null;
    }
    if (windLayer) {
      map.removeLayer(windLayer);
      windLayer=null;
    }
  }

  function buildWindPoints() {
    const pts=[];

    // Kullanıcının konumu yerine her zaman haritanın tam merkezini sorgula.
    const center = map.getCenter();
    pts.push({
      lat:center.lat,
      lng:center.lng,
      kind:"center",
      id:null
    });

    for (const t of targets) {
      pts.push({
        lat:t.lat,
        lng:t.lng,
        kind:"target",
        id:t.id
      });
    }

    return pts;
  }

  function destinationPoint(lat, lng, bearingDeg, distanceMeters) {
    const R = 6371008.8;
    const brng = bearingDeg * Math.PI / 180;
    const d = distanceMeters / R;
    const p1 = lat * Math.PI / 180;
    const l1 = lng * Math.PI / 180;

    const p2 = Math.asin(
      Math.sin(p1) * Math.cos(d) +
      Math.cos(p1) * Math.sin(d) * Math.cos(brng)
    );

    const l2 = l1 + Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(p1),
      Math.cos(d) - Math.sin(p1) * Math.sin(p2)
    );

    return {
      lat:p2 * 180 / Math.PI,
      lng:((l2 * 180 / Math.PI + 540) % 360) - 180
    };
  }

  function rayToMapEdge(lat, lng, bearingDeg) {
    // İzdüşümü doğrudan ekran üzerindeki ok yönüyle uzat.
    // 0° = kuzey/yukarı, 90° = doğu/sağ, 180° = güney/aşağı, 270° = batı/sol.
    const p0 = map.latLngToContainerPoint([lat,lng]);
    const r = bearingDeg * Math.PI / 180;

    const dx = Math.sin(r);
    const dy = -Math.cos(r);

    const w = map.getSize().x;
    const h = map.getSize().y;
    const candidates = [];

    if (dx > 1e-9) candidates.push((w - p0.x) / dx);
    if (dx < -1e-9) candidates.push((0 - p0.x) / dx);
    if (dy > 1e-9) candidates.push((h - p0.y) / dy);
    if (dy < -1e-9) candidates.push((0 - p0.y) / dy);

    const valid = candidates.filter(t => Number.isFinite(t) && t > 0);
    let t = valid.length ? Math.min(...valid) : 0;

    // Çizgi harita sınırını tamamen görsel olarak tamamlasın.
    t += 8;

    const endPoint = L.point(
      p0.x + dx * t,
      p0.y + dy * t
    );

    return map.containerPointToLatLng(endPoint);
  }

  function makeWindArrowIcon(toDir, speed, big=false) {
    const size = big ? 66 : 54;
    const cls = big ? "wind-arrow location-wind-arrow" : "wind-arrow target-wind-arrow";
    const speedCls = big ? "wind-speed location-wind-speed" : "wind-speed target-wind-speed";

    return L.divIcon({
      className:"wind-icon-wrap",
      html:
        `<div class="${cls}" style="transform:rotate(${toDir}deg)">`+
          `<div class="${speedCls}" style="transform:translateX(-50%) rotate(${-toDir}deg)">`+
            `${Math.round(speed)} km/sa`+
          `</div>`+
        `</div>`,
      iconSize:[size,size],
      iconAnchor:[size/2,size/2]
    });
  }

  function updateCenterWind(speed, fromDir) {
    const toDir = normalize360(fromDir + 180);
    const dir = directionText(toDir);
    const text = `${Math.round(speed)} km/sa · ${Math.round(toDir)}° ${dir}`;

    if (els.centerWind) els.centerWind.hidden = false;
    if (els.centerWindArrow) {
      // ➤ varsayılan olarak sağa baktığı için meteorolojik 0° (kuzey) için -90° düzelt.
      els.centerWindArrow.style.transform =
        `translate(-50%,-50%) rotate(${toDir - 90}deg)`;
    }
    if (els.centerWindSpeed) els.centerWindSpeed.textContent = `${Math.round(speed)} km/sa`;
    if (els.centerWindDirection) els.centerWindDirection.textContent = `${Math.round(toDir)}° ${dir}`;
    if (els.centerWindTop) els.centerWindTop.textContent = text;
    if (els.centerWindBottom) els.centerWindBottom.textContent = text;
  }

  function clearCenterWindUI() {
    if (els.centerWind) els.centerWind.hidden = true;
    if (els.centerWindTop) els.centerWindTop.textContent = "Rüzgâr kapalı";
    if (els.centerWindBottom) els.centerWindBottom.textContent = "Rüzgâr kapalı";
  }

  function addTargetWindProjection(target, speed, fromDir) {
    if (!target || !windLayer) return;

    const toDir = normalize360(fromDir + 180);

    // Hedefin hemen sonrasından başlat:
    // çizgi ve ok hedef işaretinin üstüne binmesin.
    const zoom = map.getZoom();
    const offsetM =
      zoom >= 18 ? 18 :
      zoom >= 16 ? 35 :
      zoom >= 14 ? 70 :
      zoom >= 12 ? 140 : 280;

    const start = destinationPoint(
      target.lat,
      target.lng,
      toDir,
      offsetM
    );

    const end = rayToMapEdge(start.lat,start.lng,toDir);

    // Kesik izdüşüm yalnızca rüzgârın AKIŞ yönünde uzar.
    L.polyline(
      [[start.lat,start.lng],[end.lat,end.lng]],
      {
        color:"#ff2d55",
        weight:2.5,
        opacity:.92,
        dashArray:"11 11",
        lineCap:"round",
        interactive:false
      }
    ).addTo(windLayer);

    // Oku hedefin üstüne değil, hedefin biraz ilerisine koy.
    // Böylece önce hedef noktası, sonra rüzgâr oku, sonra kesik izdüşüm görülür.
    const arrowPos = destinationPoint(
      target.lat,
      target.lng,
      toDir,
      offsetM * 1.65
    );

    L.marker([arrowPos.lat,arrowPos.lng],{
      icon:makeWindArrowIcon(toDir,speed,false),
      interactive:false,
      keyboard:false,
      zIndexOffset:1500
    }).addTo(windLayer);
  }

  async function refreshWind() {
    if (!windOn) return;

    clearWindLayer();
    windLayer=L.layerGroup().addTo(map);
    els.windStatus.textContent="yükleniyor…";

    const pts=buildWindPoints();

    if (!pts.length) {
      els.windStatus.textContent="konum/hedef yok";
      return;
    }

    const latitudes=pts.map(p=>p.lat.toFixed(5)).join(",");
    const longitudes=pts.map(p=>p.lng.toFixed(5)).join(",");

    const url=
      `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitudes)}`+
      `&longitude=${encodeURIComponent(longitudes)}`+
      `&current=wind_speed_10m,wind_direction_10m`+
      `&wind_speed_unit=kmh&timezone=auto`;

    windAbort=new AbortController();

    try {
      const res=await fetch(url,{signal:windAbort.signal});
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const json=await res.json();
      const arr=Array.isArray(json)?json:[json];

      let centerAdded=false;
      let targetCount=0;

      arr.forEach((item,i)=>{
        const speed=Number(item?.current?.wind_speed_10m);
        const fromDir=Number(item?.current?.wind_direction_10m);

        if(!Number.isFinite(speed)||!Number.isFinite(fromDir)) return;

        const p=pts[i];
        if(!p) return;

        if(p.kind==="center"){
          updateCenterWind(speed,fromDir);
          centerAdded=true;
        } else if(p.kind==="target"){
          const target=targets.find(t=>t.id===p.id);
          if(target){
            addTargetWindProjection(target,speed,fromDir);
            targetCount++;
          }
        }
      });

      const now=new Date();
      const hh=String(now.getHours()).padStart(2,"0");
      const mm=String(now.getMinutes()).padStart(2,"0");
      const ss=String(now.getSeconds()).padStart(2,"0");

      els.windStatus.textContent=
        `${centerAdded?"merkez":"—"} + ${targetCount} hedef · ${hh}:${mm}:${ss} · 5 sn`;

    } catch(err) {
      if(err.name==="AbortError") return;
      els.windStatus.textContent="yüklenemedi";
      clearCenterWindUI();
    } finally {
      windAbort=null;
    }
  }

  function toggleWind() {
    windOn=!windOn;
    els.windBtn.querySelector("span:last-child").textContent=windOn?"Rüzgârı Kapat":"Rüzgârı Aç";
    els.windLegend.hidden=!windOn;

    if (windOn) {
      refreshWind();
      startWindInterval();
    } else {
      stopWindInterval();
      clearWindLayer();
      clearCenterWindUI();
      els.windStatus.textContent="kapalı";
    }
  }

  function normalize360(d){return ((d%360)+360)%360;}
  function signedDelta(target,current){return ((target-current+540)%360)-180;}

  function bearingDegrees(a,b){
    const lat1=a.lat*Math.PI/180,lat2=b.lat*Math.PI/180;
    const dl=(b.lng-a.lng)*Math.PI/180;
    const y=Math.sin(dl)*Math.cos(lat2);
    const x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dl);
    return normalize360(Math.atan2(y,x)*180/Math.PI);
  }

  function distanceMeters(a,b){
    const R=6371008.8;
    const p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180;
    const dp=(b.lat-a.lat)*Math.PI/180,dl=(b.lng-a.lng)*Math.PI/180;
    const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
  }

  function formatDistance(m){
    if(!Number.isFinite(m))return"—";
    return m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(m<10000?2:1)} km`;
  }

  function directionText(deg){
    const dirs=["K","KD","D","GD","G","GB","B","KB"];
    return dirs[Math.round(normalize360(deg)/45)%8];
  }

  function updateCompass(){
    const t=targets.find(x=>x.id===activeId);
    if(!t){
      els.activeTargetName.textContent="Henüz hedef yok";
      els.activeDistance.textContent="—";
      els.targetBearing.textContent="—";
      els.turnHint.textContent="—";
      els.needle.style.transform="rotate(0deg)";
      return;
    }

    els.activeTargetName.textContent=t.name;
    if(!currentPosition)return;

    const bearing=bearingDegrees(currentPosition,t);
    els.activeDistance.textContent=formatDistance(distanceMeters(currentPosition,t));
    els.targetBearing.textContent=`${Math.round(bearing)}° ${directionText(bearing)}`;

    if(deviceHeading==null){
      els.deviceBearing.textContent="sensör yok/kapalı";
      els.turnHint.textContent="Kuzeye göre";
      els.needle.style.transform=`rotate(${bearing}deg)`;
      return;
    }

    els.deviceBearing.textContent=`${Math.round(deviceHeading)}° ${directionText(deviceHeading)}`;
    const delta=signedDelta(bearing,deviceHeading);
    els.needle.style.transform=`rotate(${delta}deg)`;
    els.turnHint.textContent=Math.abs(delta)<=5?"Tam karşıda":
      delta>0?`Sağa ${Math.round(delta)}°`:`Sola ${Math.round(Math.abs(delta))}°`;
  }

  function getHeading(e){
    if(typeof e.webkitCompassHeading==="number"&&Number.isFinite(e.webkitCompassHeading))
      return normalize360(e.webkitCompassHeading);
    if(e.absolute===true&&typeof e.alpha==="number"&&Number.isFinite(e.alpha))
      return normalize360(360-e.alpha);
    if(e.type==="deviceorientationabsolute"&&typeof e.alpha==="number"&&Number.isFinite(e.alpha))
      return normalize360(360-e.alpha);
    return null;
  }

  function onOrientation(e){
    const h=getHeading(e);
    if(h==null)return;
    deviceHeading=h;
    els.orientationStatus.textContent=`${Math.round(h)}° ${directionText(h)}`;
    updateCompass();
  }

  async function enableOrientation(){
    if(!("DeviceOrientationEvent" in window)){
      els.orientationStatus.textContent="sensör desteklenmiyor";
      return;
    }
    try{
      if(typeof DeviceOrientationEvent.requestPermission==="function"){
        const r=await DeviceOrientationEvent.requestPermission();
        if(r!=="granted"){
          els.orientationStatus.textContent="izin verilmedi";
          return;
        }
      }
      window.addEventListener("deviceorientationabsolute",onOrientation,true);
      window.addEventListener("deviceorientation",onOrientation,true);
      els.orientationBtn.querySelector("span:last-child").textContent="Pusula Açık";
      els.orientationBtn.disabled=true;
      els.orientationStatus.textContent="sensör dinleniyor…";
    }catch{
      els.orientationStatus.textContent="pusula açılamadı";
    }
  }

  els.orientationBtn.addEventListener("click",enableOrientation);
  els.satelliteBtn.addEventListener("click",toggleSatellite);
  els.windBtn.addEventListener("click",toggleWind);

  els.manualLocationBtn.addEventListener("click",()=>setManualMode(true));
  els.finishManualBtn.addEventListener("click",()=>{
    manualLocation=false;
    els.manualBanner.hidden=true;
    if(userMarker)userMarker.dragging.disable();
    updateLocationUI();
  });
  els.useGpsBtn.addEventListener("click",()=>setManualMode(false));

  els.recenterBtn.addEventListener("click",()=>{
    if(currentPosition){
      map.setView([currentPosition.lat,currentPosition.lng],Math.max(map.getZoom(),accuracyZoom()));
    }
  });

  els.clearBtn.addEventListener("click",()=>{
    if(targets.length&&confirm("Tüm çizgiler silinsin mi?"))clearTargets();
  });

  loadTargets();
  initMap();

  window.addEventListener("beforeunload",()=>{
    if(watchId!=null&&navigator.geolocation)navigator.geolocation.clearWatch(watchId);
    stopWindInterval();
    clearWindLayer();
  });
})();
