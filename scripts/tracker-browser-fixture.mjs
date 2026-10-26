// Independent feature tests must not be covered by the weekly reminder.
// This does not change the application clock, welcome/release screen or data.
export async function dismissIndependentMeasurementReminder(context) {
  await context.addInitScript(() => {
    const day = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    localStorage.setItem('measurementReminderDismissed', day);
  });
}
