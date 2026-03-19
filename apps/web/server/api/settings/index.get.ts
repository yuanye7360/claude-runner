import { getAllSettings } from '../../utils/app-settings';

export default defineEventHandler(async () => {
  return await getAllSettings();
});
