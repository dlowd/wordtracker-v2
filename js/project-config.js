import createDefaultProject from './project-defaults.js';
import { getPreferences, setProjectPreference } from './preferences.js';

let cachedProject = null;

export const getProject = () => {
  if (!cachedProject) {
    const prefs = getPreferences();
    cachedProject = {
      ...createDefaultProject(),
      ...(prefs.project || {})
    };
  }
  return { ...cachedProject };
};

export const updateProject = (updates) => {
  const nextProject = {
    ...createDefaultProject(),
    ...(updates || {})
  };
  cachedProject = nextProject;
  setProjectPreference(nextProject);
  return { ...cachedProject };
};

export default getProject;
