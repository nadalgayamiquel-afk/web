export function getEffectiveRecord(
  rec: any,
  activeTasks: string[],
  allTasks: string[],
  derivedVariablesList: any[] = []
): any {
  if (!rec) return null;
  if (!allTasks || allTasks.length === 0) return rec;

  // Si todas las tareas de la sesión están activadas, devolver el registro completo
  if (activeTasks.length === allTasks.length) {
    return rec;
  }

  // Si se han desmarcado todas las tareas de la sesión, todos los valores pasan a 0
  if (activeTasks.length === 0) {
    const zeroMetricas: any = {
      ...(rec.metricas || {}),
      tareas: [],
      _hasActiveTasks: false,
    };
    for (const key of Object.keys(zeroMetricas)) {
      if (
        key === "tareas" ||
        key === "_hasActiveTasks" ||
        key === "es_simulado" ||
        key === "tipo_registro" ||
        key === "origen_dato" ||
        key === "colC" ||
        key === "fecha" ||
        key === "jugador_id"
      ) {
        continue;
      }
      if (typeof zeroMetricas[key] === "number" || !isNaN(Number(zeroMetricas[key]))) {
        zeroMetricas[key] = 0;
      }
    }
    zeroMetricas["Distance(m)"] = 0;
    zeroMetricas["Distancia Total (m)"] = 0;
    zeroMetricas["Distancia Total"] = 0;
    zeroMetricas["distancia_total"] = 0;
    zeroMetricas["distance"] = 0;
    zeroMetricas["Distancia / Min"] = 0;
    zeroMetricas["m/min"] = 0;
    zeroMetricas["distancia_min"] = 0;
    zeroMetricas["Duration(min)"] = 0;
    zeroMetricas["Tiempo"] = 0;
    zeroMetricas["duracion_min"] = 0;
    zeroMetricas["duration"] = 0;
    zeroMetricas["TIiempo Activo"] = 0;
    zeroMetricas["tiempo_activo"] = 0;
    zeroMetricas["Tiempo Efectivo"] = 0;
    zeroMetricas["tiempo_efectivo"] = 0;
    zeroMetricas["MAX Speed(km/h)"] = 0;
    zeroMetricas["Vel Max"] = 0;
    zeroMetricas["max_speed"] = 0;
    zeroMetricas["top_speed"] = 0;
    zeroMetricas["average_speed"] = 0;
    zeroMetricas["Sprints Count"] = 0;
    zeroMetricas["+24 km/h (Num)"] = 0;
    zeroMetricas["num_sprints"] = 0;
    zeroMetricas["sprints"] = 0;
    zeroMetricas["Accs Count"] = 0;
    zeroMetricas["Acc + 3 m/s2 (Num)"] = 0;
    zeroMetricas["aceleraciones"] = 0;
    zeroMetricas["num_acc"] = 0;
    zeroMetricas["Acc + 4 m/s2 (Num)"] = 0;
    zeroMetricas["Max Acc"] = 0;
    zeroMetricas["max_acc"] = 0;
    zeroMetricas["Decs Count"] = 0;
    zeroMetricas["Dec + 3 m/s2 (Num)"] = 0;
    zeroMetricas["desaceleraciones"] = 0;
    zeroMetricas["num_dec"] = 0;
    zeroMetricas["Dec + 4 m/s2 (Num)"] = 0;
    zeroMetricas["Max Dec"] = 0;
    zeroMetricas["max_dec"] = 0;
    zeroMetricas["Acc + Dec"] = 0;
    zeroMetricas["Acc+Dec"] = 0;
    zeroMetricas["acc_dec"] = 0;
    zeroMetricas["Player Load"] = 0;
    zeroMetricas["player_load"] = 0;
    zeroMetricas["load"] = 0;
    zeroMetricas["carga"] = 0;
    zeroMetricas["HMLD"] = 0;
    zeroMetricas["hmld"] = 0;
    zeroMetricas["HMLD (num)"] = 0;
    zeroMetricas["hmld_time"] = 0;
    zeroMetricas["15 - 16 km/h (Distancia)"] = 0;
    zeroMetricas["16 - 17 km/h (Distancia)"] = 0;
    zeroMetricas["1 - 8 km/h (Distancia)"] = 0;
    zeroMetricas["8 - 17 km/h (Distancia)"] = 0;
    zeroMetricas["17 - 19,8 km/h (Distancia)"] = 0;
    zeroMetricas["19,8 - 21 km/h (Distancia)"] = 0;
    zeroMetricas["21 - 24 km/h (Distancia)"] = 0;
    zeroMetricas["+ 24 km/h (Distancia)"] = 0;
    zeroMetricas["Distance +21 (m)"] = 0;
    zeroMetricas["Distancia (+21km/h) (m)"] = 0;
    zeroMetricas["+ 21 km/h (Distancia)"] = 0;
    zeroMetricas["HSR Abs (m)"] = 0;
    zeroMetricas["hsr"] = 0;
    zeroMetricas["+28 km/h (Distancia)"] = 0;
    zeroMetricas["+28 km/h (Num)"] = 0;
    zeroMetricas["+28 km/h (Tiempo)"] = 0;
    zeroMetricas["num_hids"] = 0;

    return {
      ...rec,
      duracion: 0,
      metricas: zeroMetricas,
    };
  }

  const rawTasks = rec.metricas?.tareas || rec.tareas;

  // Caso 1: El registro contiene el desglose de tareas en metricas.tareas
  if (Array.isArray(rawTasks) && rawTasks.length > 0) {
    const activeTasksForPlayer = rawTasks.filter((t: any) => {
      const name = (t.nombre || t.name || t.tarea || t.task || "").trim();
      return activeTasks.some((sel) => sel.toLowerCase() === name.toLowerCase());
    });

    const inactiveTasksForPlayer = rawTasks.filter((t: any) => {
      const name = (t.nombre || t.name || t.tarea || t.task || "").trim();
      return !activeTasks.some((sel) => sel.toLowerCase() === name.toLowerCase());
    });

    if (activeTasksForPlayer.length === rawTasks.length) {
      return rec;
    }

    if (activeTasksForPlayer.length === 0) {
      return getEffectiveRecord(rec, [], allTasks, derivedVariablesList);
    }

    let sumDist = 0;
    let sumDur = 0;
    let sumDurAct = 0;
    let sumDurEf = 0;
    let sumSprints = 0;
    let sumAcc = 0;
    let sumAcc4 = 0;
    let sumDec = 0;
    let sumDec4 = 0;
    let sumPL = 0;
    let maxSpeed = 0;
    let maxAcc = 0;
    let maxDec = 0;
    let sumHsr = 0;
    let sumV1_8 = 0;
    let sumV8_17 = 0;
    let sumV17_19 = 0;
    let sumV19_21 = 0;
    let sumV21 = 0;
    let sumV24 = 0;
    let sumV28Num = 0;
    let sumV28Dist = 0;
    let sumV28Time = 0;
    let sumHids = 0;
    let sumHmld = 0;
    let sumHmldNum = 0;
    let sumHmldTime = 0;

    activeTasksForPlayer.forEach((t: any) => {
      const d = Number(t["Distance(m)"] || t["Distancia Total (m)"] || t["Distancia Total"] || t.distancia_total || t.distance || 0);
      const dur = Number(t["Duration(min)"] || t.Tiempo || t.duracion_min || t.duration || 0);
      const tAct = Number(t["TIiempo Activo"] || t.tiempo_activo || 0);
      const tEf = Number(t["Tiempo Efectivo"] || t.tiempo_efectivo || 0);
      const sp = Number(t["Sprints Count"] || t["+24 km/h (Num)"] || t.num_sprints || t.sprints || 0);
      const ac = Number(t["Accs Count"] || t["Acc + 3 m/s2 (Num)"] || t.aceleraciones || t.num_acc || t.acc || 0);
      const ac4 = Number(t["Acc + 4 m/s2 (Num)"] || 0);
      const dc = Number(t["Decs Count"] || t["Dec + 3 m/s2 (Num)"] || t.desaceleraciones || t.num_dec || t.dec || 0);
      const dc4 = Number(t["Dec + 4 m/s2 (Num)"] || 0);
      const pl = Number(t["Player Load"] || t.player_load || t.load || t.carga || t.HMLD || t.hmld || 0);
      const spd = Number(t["MAX Speed(km/h)"] || t["Vel Max"] || t.max_speed || t.top_speed || 0);
      const mAc = Number(t["Max Acc"] || t.max_acc || 0);
      const mDc = Math.abs(Number(t["Max Dec"] || t.max_dec || 0));
      const hsrVal = Number(t["HSR Abs (m)"] || t.hsr || 0);

      sumDist += d;
      sumDur += dur;
      sumDurAct += tAct;
      sumDurEf += tEf;
      sumSprints += sp;
      sumAcc += ac;
      sumAcc4 += ac4;
      sumDec += dc;
      sumDec4 += dc4;
      sumPL += pl;
      if (spd > maxSpeed) maxSpeed = spd;
      if (mAc > maxAcc) maxAcc = mAc;
      if (mDc > maxDec) maxDec = mDc;
      sumHsr += hsrVal;

      sumV1_8 += Number(t["15 - 16 km/h (Distancia)"] || t["15-16 km/h (Distancia)"] || t["1 - 8 km/h (Distancia)"] || t.distance_vrange1 || 0);
      sumV8_17 += Number(t["16 - 17 km/h (Distancia)"] || t["16-17 km/h (Distancia)"] || t["8 - 17 km/h (Distancia)"] || t.distance_vrange2 || 0);
      sumV17_19 += Number(t["17 - 19,8 km/h (Distancia)"] || 0);
      sumV19_21 += Number(t["19,8 - 21 km/h (Distancia)"] || 0);
      sumV21 += Number(t["21 - 24 km/h (Distancia)"] || 0);
      sumV24 += Number(t["+ 24 km/h (Distancia)"] || 0);
      sumV28Num += Number(t["+28 km/h (Num)"] || 0);
      sumV28Dist += Number(t["+28 km/h (Distancia)"] || 0);
      sumV28Time += Number(t["+28 km/h (Tiempo)"] || 0);
      sumHids += Number(t.num_hids || 0);
      sumHmld += Number(t.HMLD || t.hmld || 0);
      sumHmldNum += Number(t["HMLD (num)"] || 0);
      sumHmldTime += Number(t.hmld_time || 0);
    });

    if (sumHsr === 0 && (sumV21 > 0 || sumV24 > 0 || sumV19_21 > 0)) {
      sumHsr = Math.round(sumV21 + sumV24 + sumV19_21);
    }

    const origDist = Number(rec.metricas?.["Distance(m)"] || rec.metricas?.["Distancia Total (m)"] || 0);
    const origHsr = Number(rec.metricas?.["HSR Abs (m)"] || rec.metricas?.hsr || 0);
    let finalHsr = sumHsr;
    if (finalHsr === 0 && origHsr > 0 && origDist > 0 && sumDist > 0) {
      finalHsr = Math.round(origHsr * (sumDist / origDist));
    }

    const distMin = sumDur > 0 ? Math.round((sumDist / sumDur) * 100) / 100 : 0;
    const avgSpd = distMin > 0 ? Math.round((distMin * 0.06) * 100) / 100 : 0;
    const dist21 = Math.round(sumV21 + sumV24);
    const accDec = Math.round(sumAcc + sumDec);
    const finalPL = sumPL > 0 ? Math.round(sumPL) : (sumHmld > 0 ? Math.round(sumHmld) : 0);

    const newMetricas: any = {};
    const origDur = Number(rec.metricas?.["Duration(min)"] || rec.metricas?.Tiempo || rec.duracion || 0);
    const durRatio = origDur > 0 ? (sumDur / origDur) : (activeTasksForPlayer.length / rawTasks.length);

    if (rec.metricas && typeof rec.metricas === "object") {
      for (const [k, v] of Object.entries(rec.metricas)) {
        if (
          k === "tareas" ||
          k === "_hasActiveTasks" ||
          k === "es_simulado" ||
          k === "tipo_registro" ||
          k === "origen_dato" ||
          k === "colC" ||
          k === "fecha" ||
          k === "jugador_id"
        ) {
          newMetricas[k] = v;
          continue;
        }

        const numVal = Number(v);
        if (isNaN(numVal)) {
          newMetricas[k] = v;
          continue;
        }

        let actSum = 0;
        let hasInTasks = false;
        for (const t of activeTasksForPlayer) {
          if (t[k] !== undefined && t[k] !== null && !isNaN(Number(t[k]))) {
            actSum += Number(t[k]);
            hasInTasks = true;
          }
        }

        if (hasInTasks) {
          newMetricas[k] = Math.max(0, Math.round(actSum * 100) / 100);
        } else {
          newMetricas[k] = Math.max(0, Math.round(numVal * durRatio * 100) / 100);
        }
      }
    }

    newMetricas["Distance(m)"] = Math.round(sumDist);
    newMetricas["Distancia Total (m)"] = Math.round(sumDist);
    newMetricas["Distancia Total"] = Math.round(sumDist);
    newMetricas["distancia_total"] = Math.round(sumDist);
    newMetricas["distance"] = Math.round(sumDist);

    newMetricas["Duration(min)"] = Math.round(sumDur * 100) / 100;
    newMetricas["Tiempo"] = Math.round(sumDur * 100) / 100;
    newMetricas["duracion_min"] = Math.round(sumDur * 100) / 100;
    newMetricas["duration"] = Math.round(sumDur * 100) / 100;

    newMetricas["TIiempo Activo"] = Math.round(sumDurAct * 100) / 100;
    newMetricas["tiempo_activo"] = Math.round(sumDurAct * 100) / 100;
    newMetricas["Tiempo Efectivo"] = Math.round(sumDurEf * 100) / 100;
    newMetricas["tiempo_efectivo"] = Math.round(sumDurEf * 100) / 100;

    newMetricas["Distancia / Min"] = distMin;
    newMetricas["m/min"] = distMin;
    newMetricas["distancia_min"] = distMin;
    newMetricas["average_speed"] = avgSpd;

    newMetricas["MAX Speed(km/h)"] = maxSpeed;
    newMetricas["Vel Max"] = maxSpeed;
    newMetricas["max_speed"] = maxSpeed;
    newMetricas["top_speed"] = maxSpeed;

    newMetricas["Sprints Count"] = Math.round(sumSprints);
    newMetricas["+24 km/h (Num)"] = Math.round(sumSprints);
    newMetricas["num_sprints"] = Math.round(sumSprints);
    newMetricas["sprints"] = Math.round(sumSprints);

    newMetricas["Accs Count"] = Math.round(sumAcc);
    newMetricas["Acc + 3 m/s2 (Num)"] = Math.round(sumAcc);
    newMetricas["aceleraciones"] = Math.round(sumAcc);
    newMetricas["num_acc"] = Math.round(sumAcc);
    newMetricas["Acc + 4 m/s2 (Num)"] = Math.round(sumAcc4);
    newMetricas["Max Acc"] = maxAcc;
    newMetricas["max_acc"] = maxAcc;

    newMetricas["Decs Count"] = Math.round(sumDec);
    newMetricas["Dec + 3 m/s2 (Num)"] = Math.round(sumDec);
    newMetricas["desaceleraciones"] = Math.round(sumDec);
    newMetricas["num_dec"] = Math.round(sumDec);
    newMetricas["Dec + 4 m/s2 (Num)"] = Math.round(sumDec4);
    newMetricas["Max Dec"] = maxDec;
    newMetricas["max_dec"] = maxDec;

    newMetricas["Acc + Dec"] = accDec;
    newMetricas["Acc+Dec"] = accDec;
    newMetricas["acc_dec"] = accDec;

    newMetricas["Player Load"] = finalPL;
    newMetricas["player_load"] = finalPL;
    newMetricas["load"] = finalPL;
    newMetricas["carga"] = finalPL;

    newMetricas["HMLD"] = Math.round(sumHmld);
    newMetricas["hmld"] = Math.round(sumHmld);
    newMetricas["HMLD (num)"] = Math.round(sumHmldNum);
    newMetricas["hmld_time"] = Math.round(sumHmldTime * 100) / 100;

    newMetricas["HSR Abs (m)"] = finalHsr;
    newMetricas["hsr"] = finalHsr;

    newMetricas["15 - 16 km/h (Distancia)"] = Math.round(sumV1_8);
    newMetricas["16 - 17 km/h (Distancia)"] = Math.round(sumV8_17);
    newMetricas["1 - 8 km/h (Distancia)"] = Math.round(sumV1_8);
    newMetricas["8 - 17 km/h (Distancia)"] = Math.round(sumV8_17);
    newMetricas["17 - 19,8 km/h (Distancia)"] = Math.round(sumV17_19);
    newMetricas["19,8 - 21 km/h (Distancia)"] = Math.round(sumV19_21);
    newMetricas["21 - 24 km/h (Distancia)"] = Math.round(sumV21);
    newMetricas["+ 24 km/h (Distancia)"] = Math.round(sumV24);
    newMetricas["Distance +21 (m)"] = dist21;
    newMetricas["Distancia (+21km/h) (m)"] = dist21;
    newMetricas["+ 21 km/h (Distancia)"] = dist21;

    newMetricas["+28 km/h (Num)"] = Math.round(sumV28Num);
    newMetricas["+28 km/h (Distancia)"] = Math.round(sumV28Dist);
    newMetricas["+28 km/h (Tiempo)"] = Math.round(sumV28Time * 100) / 100;
    newMetricas["num_hids"] = Math.round(sumHids);

    newMetricas.tareas = activeTasksForPlayer;
    newMetricas._hasActiveTasks = true;

    return {
      ...rec,
      duracion: Math.round(sumDur * 100) / 100,
      metricas: newMetricas,
    };
  }

  // Caso 2: Si el registro no tiene tareas desglosadas pero hay tareas en la sesión y se han desmarcado algunas
  if (activeTasks.length < allTasks.length) {
    const ratio = activeTasks.length / allTasks.length;
    const scaledMetricas: any = { ...(rec.metricas || {}) };
    for (const [k, v] of Object.entries(scaledMetricas)) {
      if (
        k === "tareas" ||
        k === "_hasActiveTasks" ||
        k === "es_simulado" ||
        k === "tipo_registro" ||
        k === "origen_dato" ||
        k === "colC" ||
        k === "fecha" ||
        k === "jugador_id"
      ) {
        continue;
      }
      const numVal = Number(v);
      if (!isNaN(numVal)) {
        scaledMetricas[k] = Math.max(0, Math.round(numVal * ratio * 100) / 100);
      }
    }
    const origDur = Number(rec.duracion || rec.metricas?.["Duration(min)"] || 0);
    return {
      ...rec,
      duracion: Math.max(0, Math.round(origDur * ratio * 100) / 100),
      metricas: scaledMetricas,
    };
  }

  return rec;
}
