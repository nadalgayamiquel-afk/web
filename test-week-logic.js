function getWeekRange(dateStr, startDay) {
  // startDay: 1 = Monday, 2 = Tuesday
  const d = new Date(dateStr);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  
  // Calculate diff to the previous startDay
  let diff = day - startDay;
  if (diff < 0) diff += 7;
  
  const start = new Date(d);
  start.setDate(d.getDate() - diff);
  
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0]
  };
}

console.log("Monday start (2023-10-10, Tue):", getWeekRange("2023-10-10", 1));
console.log("Tuesday start (2023-10-10, Tue):", getWeekRange("2023-10-10", 2));
console.log("Tuesday start (2023-10-09, Mon):", getWeekRange("2023-10-09", 2));
