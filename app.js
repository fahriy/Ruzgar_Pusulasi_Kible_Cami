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

  let windOn = true;
  let centerWindOn = false;
  let headingArrowOn = false;
  let qiblaOn = false;
  let targetAddMode = false;
  let orientationListening = false;
  let windLayer = null;
  let windAbort = null;
  let windTimer = null;
  let windInterval = null;
  let geoWatchId = null;
  let geoStarted = false;

  const KAABA = {lat:21.422487, lng:39.826206};
  const QIBLA_ALIGN_TOLERANCE = 3;
  let headingMarker = null;
  let qiblaLayer = null;
  let qiblaKaabaMarker = null;
  let qiblaAlignMarker = null;

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
    centerWindDirection: $("centerWindDirection"),
    centerWindTop: $("centerWindTop"),
    centerWindBottom: $("centerWindBottom"),
    mobileWindBtn: $("mobileWindBtn"),
    mobileSatelliteBtn: $("mobileSatelliteBtn"),
    mobileRecenterBtn: $("mobileRecenterBtn"),
    mobileAddTargetBtn: $("mobileAddTargetBtn"),
    mobileMenuBtn: $("mobileMenuBtn"),
    mobileDrawer: $("mobileDrawer"),
    mobileDrawerBackdrop: $("mobileDrawerBackdrop"),
    mobileDrawerClose: $("mobileDrawerClose"),
    drawerWindBtn: $("drawerWindBtn"),
    drawerSatelliteBtn: $("drawerSatelliteBtn"),
    drawerRecenterBtn: $("drawerRecenterBtn"),
    drawerManualBtn: $("drawerManualBtn"),
    drawerCompassBtn: $("drawerCompassBtn"),
    mobileFollowToggle: $("mobileFollowToggle"),
    mobileLocationStatus: $("mobileLocationStatus"),
    mobileWindStatus: $("mobileWindStatus"),
    qiblaBtn: $("qiblaBtn"),
    headingArrowBtn: $("headingArrowBtn"),
    centerWindToggleBtn: $("centerWindToggleBtn"),
    drawerQiblaBtn: $("drawerQiblaBtn"),
    drawerHeadingBtn: $("drawerHeadingBtn"),
    drawerCenterWindBtn: $("drawerCenterWindBtn"),
    qiblaAligned: $("qiblaAligned"),
    addTargetModeBtn: $("addTargetModeBtn"),
    drawerAddTargetBtn: $("drawerAddTargetBtn"),
    targetAddBanner: $("targetAddBanner"),
    cancelTargetAddBtn: $("cancelTargetAddBtn")
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
      if (qiblaOn) updateQiblaLayer();
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
      const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");
      if(!Array.isArray(raw)) return;

      targets=raw
        .filter(x=>Number.isFinite(x?.lat)&&Number.isFinite(x?.lng))
        .slice(0,50)
        .map((x,i)=>({
          id:i+1,
          lat:x.lat,
          lng:x.lng,
          name:(typeof x.name==="string"&&x.name.trim())?x.name.trim():`Hedef ${i+1}`,
          color:COLORS[i%COLORS.length],
          line:null,
          marker:null
        }));

      nextId=targets.length+1;
      activeId=targets[0]?.id??null;
    }catch(_){}
  }

  function renumberTargets(activeTargetRef=null){
    targets.forEach((t,i)=>{
      const oldDefault=/^Hedef \d+$/.test(t.name||"");
      t.id=i+1;
      if(oldDefault||!t.name) t.name=`Hedef ${i+1}`;
      t.color=COLORS[i%COLORS.length];
      if(t.marker) t.marker.setIcon(targetIcon(t.color));
      if(t.line) t.line.setStyle({color:t.color});
    });
    nextId=targets.length+1;
    if(activeTargetRef&&targets.includes(activeTargetRef)) activeId=activeTargetRef.id;
    else if(!targets.some(t=>t.id===activeId)) activeId=targets[0]?.id??null;
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
    const locText = `${currentPosition.lat.toFixed(6)}, ${currentPosition.lng.toFixed(6)}${manualLocation ? " (elle)" : ""}`;
    els.locationStatus.textContent = locText;
    if (els.mobileLocationStatus) els.mobileLocationStatus.textContent = locText;
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
      updateHeadingMarker();
      updateQiblaAlignment();
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

  function setTargetAddMode(enabled){
    targetAddMode=!!enabled;
    if(els.targetAddBanner) els.targetAddBanner.hidden=!targetAddMode;
    if(els.addTargetModeBtn) els.addTargetModeBtn.classList.toggle("is-active",targetAddMode);
    if(els.mobileAddTargetBtn) els.mobileAddTargetBtn.classList.toggle("is-active",targetAddMode);
    if(targetAddMode) map.getContainer().style.cursor="crosshair";
    else map.getContainer().style.cursor="";
  }

  function addTarget(lat,lng) {
    const id=targets.length+1;
    const t={
      id,lat,lng,
      name:`Hedef ${id}`,
      color:COLORS[(id-1)%COLORS.length],
      line:null,marker:null
    };
    targets.push(t);
    renumberTargets(t);
    activeId=t.id;
    createTargetLayers(t);
    saveTargets();
    renderTargetsList();
    updateCompass();
    if (windOn) refreshWind();
  }

  function removeTarget(id) {
    const i=targets.findIndex(t=>t.id===id);
    if(i<0) return;
    const t=targets[i];
    const wasActive=activeId===id;
    if(t.line) map.removeLayer(t.line);
    if(t.marker) map.removeLayer(t.marker);
    targets.splice(i,1);

    const newActive=wasActive
      ? (targets[Math.min(i,targets.length-1)]||targets[0]||null)
      : (targets.find(x=>x.id===activeId)||null);

    renumberTargets(newActive);
    saveTargets();
    renderTargetsList();
    updateCompass();
    if(windOn) refreshWind();
  }

  function clearTargets() {
    for (const t of targets) {
      if (t.line) map.removeLayer(t.line);
      if (t.marker) map.removeLayer(t.marker);
    }
    targets=[];
    activeId=null;
    nextId=1;
    saveTargets();
    renderTargetsList();
    updateCompass();
    if (windOn) refreshWind();
  }

  function escapeHtml(s){
    return String(s??"").replace(/[&<>"']/g,c=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
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
      if (els.mobileFollowToggle) els.mobileFollowToggle.checked=false;
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
    setTimeout(syncMobileControls,0);
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
    }, 5 * 60 * 1000);
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

    if(centerWindOn){
      const center=map.getCenter();
      pts.push({lat:center.lat,lng:center.lng,kind:"center",id:null});
    }

    for(const t of targets){
      pts.push({lat:t.lat,lng:t.lng,kind:"target",id:t.id});
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

  function makeWindArrowIcon(toDir) {
    const size=54;
    return L.divIcon({
      className:"wind-icon-wrap",
      html:`<div class="wind-arrow target-wind-arrow" style="transform:rotate(${toDir}deg)"></div>`,
      iconSize:[size,size],
      iconAnchor:[size/2,size/2]
    });
  }

  function updateCenterWind(speed, fromDir) {
    if(!centerWindOn) return;
    const toDir=normalize360(fromDir+180);
    const dir = directionText(toDir);
    const text = `${Math.round(speed)} km/sa · ${Math.round(toDir)}° ${dir}`;

    if (els.centerWind) els.centerWind.hidden = false;
    if (els.centerWindArrow) {
      // ➤ varsayılan olarak sağa baktığı için meteorolojik 0° (kuzey) için -90° düzelt.
      els.centerWindArrow.style.transform =
        `translate(-50%,-50%) rotate(${toDir - 90}deg)`;
    }
    if(els.centerWindDirection) els.centerWindDirection.textContent=`${Math.round(toDir)}° ${dir}`;
    if (els.centerWindTop) els.centerWindTop.textContent = text;
    if (els.centerWindBottom) els.centerWindBottom.textContent = text;
  }

  function clearCenterWindUI() {
    if (els.centerWind) els.centerWind.hidden = true;
    if(els.centerWindTop) els.centerWindTop.textContent=centerWindOn?"Veri bekleniyor…":"Kapalı";
    if(els.centerWindBottom) els.centerWindBottom.textContent=centerWindOn?"Veri bekleniyor…":"Kapalı";
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
      icon:makeWindArrowIcon(toDir),
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

    if(!pts.length){
      els.windStatus.textContent="aktif · hedef yok";
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
        `${centerAdded?"merkez":"—"} + ${targetCount} hedef · ${hh}:${mm}:${ss} · 5 dk`;

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
    setTimeout(syncMobileControls,0);
  }


  function setCenterWindEnabled(enabled){
    centerWindOn=!!enabled;
    els.centerWindToggleBtn.classList.toggle("is-active",centerWindOn);
    els.centerWindToggleBtn.querySelector("span:last-child").textContent=
      centerWindOn?"Merkez Rüzgârını Kapat":"Merkez Rüzgârını Aç";
    if(!centerWindOn) clearCenterWindUI();
    else if(windOn) refreshWind();
    syncMobileControls();
  }

  function headingIcon(heading){
    return L.divIcon({
      className:"heading-marker-wrap",
      html:`<div class="heading-arrow-marker" style="transform:rotate(${heading}deg)"></div>`,
      iconSize:[52,52],iconAnchor:[26,26]
    });
  }

  function updateHeadingMarker(){
    if(!map) return;
    if(!headingArrowOn||!currentPosition||deviceHeading==null){
      if(headingMarker){map.removeLayer(headingMarker);headingMarker=null;}
      updateQiblaAlignment();
      return;
    }
    const ll=[currentPosition.lat,currentPosition.lng];
    const icon=headingIcon(deviceHeading);
    if(!headingMarker){
      headingMarker=L.marker(ll,{icon,interactive:false,keyboard:false,zIndexOffset:1900}).addTo(map);
    }else{
      headingMarker.setLatLng(ll);
      headingMarker.setIcon(icon);
    }
    updateQiblaAlignment();
  }

  async function setHeadingArrowEnabled(enabled){
    headingArrowOn=!!enabled;
    els.headingArrowBtn.classList.toggle("is-active",headingArrowOn);
    els.headingArrowBtn.querySelector("span:last-child").textContent=
      headingArrowOn?"Bakış Okunu Kapat":"Bakış Okunu Aç";
    if(headingArrowOn&&deviceHeading==null) await enableOrientation();
    updateHeadingMarker();
    syncMobileControls();
  }

  function greatCirclePoints(a,b,segments=72){
    const toVec=p=>{
      const lat=p.lat*Math.PI/180,lng=p.lng*Math.PI/180;
      return [Math.cos(lat)*Math.cos(lng),Math.cos(lat)*Math.sin(lng),Math.sin(lat)];
    };
    const av=toVec(a),bv=toVec(b);
    let dot=Math.max(-1,Math.min(1,av[0]*bv[0]+av[1]*bv[1]+av[2]*bv[2]));
    const omega=Math.acos(dot);
    if(omega<1e-9) return [[a.lat,a.lng],[b.lat,b.lng]];
    const so=Math.sin(omega),pts=[];
    for(let i=0;i<=segments;i++){
      const t=i/segments;
      const s1=Math.sin((1-t)*omega)/so,s2=Math.sin(t*omega)/so;
      const x=s1*av[0]+s2*bv[0],y=s1*av[1]+s2*bv[1],z=s1*av[2]+s2*bv[2];
      pts.push([
        Math.atan2(z,Math.sqrt(x*x+y*y))*180/Math.PI,
        Math.atan2(y,x)*180/Math.PI
      ]);
    }
    return pts;
  }

  function kaabaIcon(){
    return L.divIcon({
      className:"qibla-marker-wrap",
      html:'<div class="kaaba-marker">K</div>',
      iconSize:[24,24],iconAnchor:[12,12]
    });
  }

  function updateQiblaLayer(){
    if(!map) return;
    if(!qiblaOn||!currentPosition){
      if(qiblaLayer){map.removeLayer(qiblaLayer);qiblaLayer=null;}
      if(qiblaKaabaMarker){map.removeLayer(qiblaKaabaMarker);qiblaKaabaMarker=null;}
      updateQiblaAlignment();
      return;
    }

    const pts=greatCirclePoints(currentPosition,KAABA);
    if(!qiblaLayer){
      qiblaLayer=L.polyline(pts,{
        color:"#e3bc59",weight:3,opacity:.95,dashArray:"8 8",lineCap:"round",interactive:false
      }).addTo(map);
    }else qiblaLayer.setLatLngs(pts);

    const qb=bearingDegrees(currentPosition,KAABA);
    qiblaLayer.bindTooltip(`Kıble ${Math.round(qb)}° ${directionText(qb)}`,{
      permanent:false,direction:"top",className:"qibla-leaflet-label"
    });

    if(!qiblaKaabaMarker){
      qiblaKaabaMarker=L.marker([KAABA.lat,KAABA.lng],{
        icon:kaabaIcon(),interactive:false,keyboard:false
      }).addTo(map);
    }
    updateQiblaAlignment();
  }

  function angularDifference(a,b){
    return Math.abs(((a-b+540)%360)-180);
  }

  function updateQiblaAlignment(){
    const aligned=qiblaOn&&headingArrowOn&&currentPosition&&deviceHeading!=null
      && angularDifference(deviceHeading,bearingDegrees(currentPosition,KAABA))<=QIBLA_ALIGN_TOLERANCE;

    if(els.qiblaAligned) els.qiblaAligned.hidden=!aligned;

    // Hizalanınca ayrıca harita işareti oluşturma; telefon bakış oku görünür kalır.
    if(qiblaAlignMarker){
      map.removeLayer(qiblaAlignMarker);
      qiblaAlignMarker=null;
    }
  }

  async function setQiblaEnabled(enabled){
    qiblaOn=!!enabled;
    els.qiblaBtn.classList.toggle("is-active",qiblaOn);
    els.qiblaBtn.querySelector("span:last-child").textContent=qiblaOn?"Kıbleyi Kapat":"Kıbleyi Aç";

    if(qiblaOn){
      // Kıble açılırsa bakış oku da otomatik açılsın.
      await setHeadingArrowEnabled(true);
      updateQiblaLayer();
    }else{
      updateQiblaLayer();
      // Bakış oku kullanıcının açık tuttuğu bağımsız ayar olarak kalabilir.
    }
    syncMobileControls();
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
    try{
      if(typeof DeviceOrientationEvent!=="undefined" &&
         typeof DeviceOrientationEvent.requestPermission==="function"){
        const permission=await DeviceOrientationEvent.requestPermission();
        if(permission!=="granted"){
          els.orientationStatus.textContent="izin verilmedi";
          return;
        }
      }

      if(!orientationListening){
        const handler=(event)=>{
          let heading=null;

          // iOS Safari
          if(typeof event.webkitCompassHeading==="number"){
            heading=event.webkitCompassHeading;
          }
          // Android / absolute orientation
          else if(event.absolute && typeof event.alpha==="number"){
            heading=normalize360(360-event.alpha);
          }
          // Generic fallback
          else if(typeof event.alpha==="number"){
            heading=normalize360(360-event.alpha);
          }

          if(heading==null||!Number.isFinite(heading)) return;

          deviceHeading=normalize360(heading);
          els.orientationStatus.textContent=`${Math.round(deviceHeading)}° ${directionText(deviceHeading)}`;
          els.orientationBtn.querySelector("span:last-child").textContent="Pusula Açık";
          updateCompass();
          updateHeadingMarker();
          updateQiblaAlignment();
        };

        window.addEventListener("deviceorientationabsolute",handler,true);
        window.addEventListener("deviceorientation",handler,true);
        orientationListening=true;
      }

      els.orientationStatus.textContent=deviceHeading==null?"sensör bekleniyor…":`${Math.round(deviceHeading)}° ${directionText(deviceHeading)}`;
    }catch(err){
      els.orientationStatus.textContent="pusula açılamadı";
    }
  }

  function openMobileDrawer() {
    if (!els.mobileDrawer) return;
    els.mobileDrawer.classList.add("open");
    els.mobileDrawer.setAttribute("aria-hidden","false");
    if (els.mobileDrawerBackdrop) {
      els.mobileDrawerBackdrop.hidden=false;
      requestAnimationFrame(()=>els.mobileDrawerBackdrop.classList.add("open"));
    }
  }

  function closeMobileDrawer() {
    if (!els.mobileDrawer) return;
    els.mobileDrawer.classList.remove("open");
    els.mobileDrawer.setAttribute("aria-hidden","true");
    if (els.mobileDrawerBackdrop) {
      els.mobileDrawerBackdrop.classList.remove("open");
      setTimeout(()=>{ els.mobileDrawerBackdrop.hidden=true; },220);
    }
  }

  function syncMobileControls() {
    if (els.mobileWindBtn) els.mobileWindBtn.classList.toggle("is-active", windOn);
    if (els.mobileSatelliteBtn) els.mobileSatelliteBtn.classList.toggle("is-active", satelliteOn);
    if (els.mobileFollowToggle) els.mobileFollowToggle.checked=els.followToggle.checked;
    if(els.mobileWindStatus) els.mobileWindStatus.textContent=els.windStatus.textContent;
    if(els.mobileLocationStatus) els.mobileLocationStatus.textContent=els.locationStatus.textContent;
    if(els.mobileAddTargetBtn) els.mobileAddTargetBtn.classList.toggle("is-active",targetAddMode);
    if(els.drawerQiblaBtn) els.drawerQiblaBtn.classList.toggle("is-active",qiblaOn);
    if(els.drawerHeadingBtn) els.drawerHeadingBtn.classList.toggle("is-active",headingArrowOn);
    if(els.drawerCenterWindBtn) els.drawerCenterWindBtn.classList.toggle("is-active",centerWindOn);
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


  if (els.mobileWindBtn) els.mobileWindBtn.addEventListener("click",()=>{ toggleWind(); syncMobileControls(); });
  if (els.mobileSatelliteBtn) els.mobileSatelliteBtn.addEventListener("click",()=>{ toggleSatellite(); syncMobileControls(); });
  if (els.mobileRecenterBtn) els.mobileRecenterBtn.addEventListener("click",()=>els.recenterBtn.click());
  if (els.mobileMenuBtn) els.mobileMenuBtn.addEventListener("click",openMobileDrawer);
  if (els.mobileDrawerClose) els.mobileDrawerClose.addEventListener("click",closeMobileDrawer);
  if (els.mobileDrawerBackdrop) els.mobileDrawerBackdrop.addEventListener("click",closeMobileDrawer);

  if (els.drawerWindBtn) els.drawerWindBtn.addEventListener("click",()=>{ toggleWind(); syncMobileControls(); });
  if (els.drawerSatelliteBtn) els.drawerSatelliteBtn.addEventListener("click",()=>{ toggleSatellite(); syncMobileControls(); });
  if (els.drawerRecenterBtn) els.drawerRecenterBtn.addEventListener("click",()=>{ els.recenterBtn.click(); closeMobileDrawer(); });
  if (els.drawerManualBtn) els.drawerManualBtn.addEventListener("click",()=>{ setManualMode(true); closeMobileDrawer(); });
  if (els.drawerCompassBtn) els.drawerCompassBtn.addEventListener("click",()=>{ enableOrientation(); closeMobileDrawer(); });

  if (els.mobileFollowToggle) {
    els.mobileFollowToggle.addEventListener("change",()=>{
      els.followToggle.checked=els.mobileFollowToggle.checked;
    });
  }
  els.followToggle.addEventListener("change",syncMobileControls);

  // Mobil çekmece açıkken Escape ile kapat.
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape") closeMobileDrawer();
  });

  // Durum bilgilerini mobil çekmeceye periyodik yansıt.
  setInterval(syncMobileControls,1000);


  els.qiblaBtn.addEventListener("click",async()=>{ await setQiblaEnabled(!qiblaOn); });
  els.headingArrowBtn.addEventListener("click",async()=>{ await setHeadingArrowEnabled(!headingArrowOn); });
  els.centerWindToggleBtn.addEventListener("click",()=>setCenterWindEnabled(!centerWindOn));

  if(els.drawerQiblaBtn) els.drawerQiblaBtn.addEventListener("click",async()=>{ await setQiblaEnabled(!qiblaOn); closeMobileDrawer(); });
  if(els.drawerHeadingBtn) els.drawerHeadingBtn.addEventListener("click",async()=>{ await setHeadingArrowEnabled(!headingArrowOn); });
  if(els.drawerCenterWindBtn) els.drawerCenterWindBtn.addEventListener("click",()=>setCenterWindEnabled(!centerWindOn));


  if(els.addTargetModeBtn) els.addTargetModeBtn.addEventListener("click",()=>setTargetAddMode(!targetAddMode));
  if(els.mobileAddTargetBtn) els.mobileAddTargetBtn.addEventListener("click",()=>setTargetAddMode(!targetAddMode));
  if(els.drawerAddTargetBtn) els.drawerAddTargetBtn.addEventListener("click",()=>{
    setTargetAddMode(true);
    closeMobileDrawer();
  });
  if(els.cancelTargetAddBtn) els.cancelTargetAddBtn.addEventListener("click",()=>setTargetAddMode(false));

  loadTargets();
  // Varsayılanlar:
  // Rüzgâr açık, merkez rüzgâr kapalı, bakış oku kapalı, kıble kapalı.
  els.windBtn.querySelector("span:last-child").textContent="Rüzgârı Kapat";
  els.windBtn.classList.add("is-active");
  els.windLegend.hidden=false;
  setCenterWindEnabled(false);
  setTimeout(()=>{ if(windOn){ refreshWind(); startWindInterval(); } },500);

  initMap();

  window.addEventListener("beforeunload",()=>{
    if(watchId!=null&&navigator.geolocation)navigator.geolocation.clearWatch(watchId);
    stopWindInterval();
    clearWindLayer();
  });
})();
