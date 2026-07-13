export type Lang = "es" | "en";

export interface Dict {
  app: {
    title: string;
    subtitle: string;
    logout: string;
    logoutConfirm: string;
  };
  common: {
    cancel: string;
    confirm: string;
    close: string;
    save: string;
    delete: string;
    edit: string;
    copy: string;
    copied: string;
    loading: string;
    error: string;
    success: string;
    yes: string;
    no: string;
  };
  nav: {
    modpack: string;
    mods: string;
    upload: string;
    instances: string;
    apiLinks: string;
  };
  modpack: {
    heading: string;
    statusAvailable: string;
    statusUnavailable: string;
    fileName: string;
    size: string;
    refresh: string;
    download: string;
    delete: string;
    deleteConfirm: string;
    noDetails: string;
    details: {
      name: string;
      version: string;
      format: string;
      mc: string;
      loader: string;
      loaderVersion: string;
      modCount: string;
    };
    mods: {
      heading: string;
      empty: string;
      source: string;
      env: string;
      size: string;
      remove: string;
      removeConfirm: (name: string) => string;
    };
  };
  mods: {
    heading: string;
    dropzoneTitle: string;
    dropzoneHint: string;
    add: string;
    success: (path: string) => string;
  };
  upload: {
    heading: string;
    dropzoneTitle: string;
    dropzoneHint: string;
    upload: string;
    pickFirst: string;
    success: (name: string, mb: number) => string;
  };
  instances: {
    heading: string;
    empty: string;
    create: string;
    createBtn: string;
    createSuccess: string;
    fields: {
      name: string;
      iconUrl: string;
      backgroundUrl: string;
    };
    errors: {
      nameRequired: string;
    };
    modpackLoaded: string;
    modpackMissing: string;
    summaryMissing: string;
    mediaConfigured: string;
    mediaMissing: string;
    actions: {
      uploadMrpack: string;
      uploadIcon: string;
      uploadBackground: string;
      generateCode: string;
      addJar: string;
      delete: string;
      deleteConfirm: (name: string) => string;
    };
    code: {
      usesUnlimited: (n: number) => string;
      usesLimited: (n: number, m: number) => string;
      copy: string;
      copied: (code: string) => string;
    };
  };
  apiLinks: {
    heading: string;
    health: string;
  };
  alerts: {
    instanceCreated: string;
    instanceDeleted: (name: string) => string;
    modpackDeleted: string;
    codeGenerated: (code: string) => string;
    mediaIconUpdated: string;
    mediaBackgroundUpdated: string;
    modpackUploaded: (name: string) => string;
    modAdded: (path: string) => string;
    modRemoved: (name: string) => string;
  };
  errors: {
    generic: string;
    network: string;
    unauth: string;
  };
}
