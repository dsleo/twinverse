import { resolveLatestTvAudienceDate } from '../src/server/lab/tvLatestDate.ts';

async function test() {
  console.log("Resolving latest TV audience date and schedule...");
  try {
    const result = await resolveLatestTvAudienceDate();
    console.log("Target Date:", result.targetDate);
    console.log("Report URL:", result.reportUrl);
    console.log("Schedule size:", result.schedule.length);
    if (result.schedule.length > 0) {
      console.log("First 3 items:");
      result.schedule.slice(0, 3).forEach((item, i) => {
        console.log(`${i+1}. [${item.channel}] ${item.programName} (${item.genre}) - Actual: ${item.actualShare}%`);
      });
    } else {
      console.log("No items found in schedule.");
    }
  } catch (e) {
    console.error("Test failed:", e);
  }
}

test();
