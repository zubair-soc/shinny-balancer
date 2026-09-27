// Adds the current shared NAIT parking code to copied skate rosters.
window.getNaitParkingCode = async function () {
  const { data, error } = await supabaseClient
    .from('app_settings')
    .select('value')
    .eq('key', 'nait_parking_code')
    .maybeSingle();
  if (error) throw error;
  return String(data?.value || '').trim();
};
