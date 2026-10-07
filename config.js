// Connexion au classement en ligne (Supabase).
// La clé « publishable » est publique par conception : la sécurité vient des règles RLS
// définies dans supabase.sql. Ne mets JAMAIS ici une clé « secret » ou « service_role ».
//
// Si les champs restent vides, le jeu fonctionne quand même avec un
// classement local (stocké dans le navigateur), pratique pour tester.
window.PUMP_CONFIG = {
  SUPABASE_URL: "https://cyqaoqoenywyvbliqzyh.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_R39WYi0IIG_KuILO4PR0Vg_mPFqse85",
};
