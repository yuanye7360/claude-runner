import { getAllRepos } from '../../utils/repo-mapping';

export default defineEventHandler(async () => {
  return await getAllRepos();
});
