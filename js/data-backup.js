export const BACKUP_VERSION = '1.0.0';

const clone = (value) => JSON.parse(JSON.stringify(value));

export const buildBackupPayload = ({ project, entries, preferences, rewards }) => ({
  metadata: {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString()
  },
  project: clone(project || {}),
  entries: clone(entries || []),
  preferences: clone(preferences || {}),
  rewards: clone(rewards || {})
});

export const triggerBackupDownload = (payload, filename) => {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

export const readBackupFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      try {
        const result = JSON.parse(reader.result);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsText(file);
  });

export const validateBackupPayload = (payload) => {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    errors.push('Backup file is not valid JSON.');
    return { valid: false, errors };
  }

  if (!payload.metadata || typeof payload.metadata !== 'object') {
    errors.push('Backup missing metadata.');
  } else if (!payload.metadata.version) {
    errors.push('Backup missing version information.');
  }

  if (!payload.project || typeof payload.project !== 'object') {
    errors.push('Backup missing project data.');
  }

  if (!Array.isArray(payload.entries)) {
    errors.push('Backup missing entries array.');
  }

  if (!payload.preferences || typeof payload.preferences !== 'object') {
    errors.push('Backup missing preferences.');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

export default {
  BACKUP_VERSION,
  buildBackupPayload,
  triggerBackupDownload,
  readBackupFile,
  validateBackupPayload
};
