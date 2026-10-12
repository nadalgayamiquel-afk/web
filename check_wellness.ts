import { fetchLiveWellnessSheet } from "./app/actions";

async function run() {
  const url = "https://docs.google.com/spreadsheets/d/1yD6h28dOqC65GgO0Qj1Zz1b98a3b5j23YpWpQ-oD5M8/edit";
  const res = await fetchLiveWellnessSheet(url);
  const data = (res as any).data;
  
  if (!data) {
    console.log("No data returned");
    return;
  }
  
  const d17 = data.filter((r: any) => r.timestamp && r.timestamp.includes("17/09/2026") && (r.name.includes("MOMOH") || r.name.includes("MUNELLS")));
  const d18 = data.filter((r: any) => r.timestamp && r.timestamp.includes("18/09/2026") && (r.name.includes("MOMOH") || r.name.includes("MUNELLS")));
  const d19 = data.filter((r: any) => r.timestamp && r.timestamp.includes("19/09/2026") && (r.name.includes("MOMOH") || r.name.includes("MUNELLS")));
  
  console.log("17/09:", d17);
  console.log("18/09:", d18);
  console.log("19/09:", d19);
}

run().catch(console.error);
