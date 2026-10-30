# 08 — Sécurité des données et des utilisateurs

Même niveau d'exigence que JUPSER EBNL, étendu au SaaS multi-pays et aux paiements.

| Domaine | Exigence |
|---|---|
| Transport | TLS 1.3 (1.2 minimum), HSTS ; épinglage du certificat dans l'application de bureau |
| Authentification | Mots de passe forts hachés Argon2id ; **double authentification obligatoire** pour administrateur, comptable, paie, fiscalité (TOTP, clé de sécurité, ou code SMS/WhatsApp en secours) ; verrouillage après 5 échecs ; déconnexion après 30 min d'inactivité ; SSO (SAML/OIDC) pour l'édition Entreprise |
| Appareils | Enrôlement des postes (code QR, certificat d'appareil, signature des requêtes) ; liste des postes autorisés ; révocation et effacement à distance |
| Autorisations | Rôles (administrateur, chef comptable, comptable, caissier, gestionnaire de paie, responsable RH, commercial, auditeur en lecture, expert-comptable externe) + périmètre (société, site, journal) ; refus par défaut |
| Séparation des tâches | Celui qui saisit un décaissement ou une paie au-delà d'un seuil ne le valide pas (validation à quatre yeux) ; les techniciens JUPSER n'accèdent pas aux données des clients sans autorisation tracée et limitée dans le temps |
| Données au repos | Disques chiffrés + **chiffrement applicatif par locataire** (AES-256-GCM, clé de données enveloppée par une clé maîtresse dans un KMS/HSM) pour salaires, pièces, RIB, identités |
| Hors ligne | Cache local chiffré (clé dérivée), effacement à distance |
| Isolation | RLS PostgreSQL + tests d'isolation automatiques à chaque build |
| Journal d'audit | Inaltérable, chaîné par empreintes SHA-256 : connexions, créations, validations, contre-passations, exports, changements de droits, actions de l'IA ; export pour l'auditeur ; vérification d'intégrité quotidienne |
| Sauvegardes | Quotidiennes, chiffrées, hors site, rétention 35 jours + mensuelles 10 ans ; test de restauration mensuel ; réversibilité : export complet (FEC-like, Excel, PDF, pièces) à tout moment |
| Paiements | Aucune donnée de carte stockée (redirection vers le prestataire certifié PCI DSS) ; webhooks signés et vérifiés ; idempotence |
| Application | OWASP ASVS niveau 2 : validation des entrées, protection injection/XSS/CSRF, limitation de débit, en-têtes de sécurité, téléversements analysés (antivirus) |
| Chaîne logicielle | Dépendances verrouillées, scan de vulnérabilités en CI, SBOM, revues de code, secrets dans un coffre |
| Exploitation | Supervision 24/7, détection d'anomalies de connexion (pays inhabituel, horaires), tests d'intrusion avant lancement puis annuels, correction des failles critiques sous 72 h |
| Données personnelles | Conformité aux lois de protection des données des pays (ex. Code du numérique en RDC, lois nationales en CI, SN, CM, GA…) : registre des traitements, consentement marketing, droits d'accès et de rectification, durée de conservation ; analyse juridique pays par pays avant lancement |
| Conservation | Pièces et livres comptables conservés selon la durée légale (10 ans dans l'AUDCIF pour les documents comptables — à confirmer pour chaque document) |
