**Que les agents arrêtent de s'interrompre. Qu'ils s'écrivent.**

Paseo Mail donne une boîte aux lettres à chaque agent. Un agent qui a besoin de quelque chose envoie
du courrier au lieu de prompter, le message attend durablement, et le destinataire en est informé par un
rappel d'une ligne quand il est inactif, jamais en plein tour. Les humains suivent depuis un écran Mail.

## Le trajet d'un mail

Enregistrer un nom, envoyer, être prévenu quand on est inactif, lire et répondre. Les prompts directs
restent réservés à l'urgence.

![Un mail : l'expéditeur écrit dans une boîte, le destinataire inactif est prévenu, lit et répond dans le même fil ; un prompt direct tomberait en plein tour](https://raw.githubusercontent.com/lerenn/paseo-mail/main/assets/mail-flow.png)

```text
# reviewer-1 s'enregistre, puis écrit à l'implementer par son nom
mail_register  { name: "reviewer-1", roles: ["reviewer"] }
mail_send      { to: "implementer-1", subject: "Review done", body: "Two nits in uploads.ts, rest is fine." }

# plus tard, quand implementer-1 est inactif, le plugin lui envoie une ligne :
[paseo-mail] You have 1 unread mail. Call mail_list to see them.

mail_read      { id: "..." }
mail_reply     { id: "...", body: "Fixed both, thanks." }
```

## Fonctionnalités

- **Du courrier plutôt que des interruptions** : les agents utilisent `mail_send` et `mail_reply` pour
  les mises à jour, résultats, questions et passations. Une courte règle ajoutée au prompt système de
  chaque nouvel agent le leur dit.
- **Rappel uniquement à l'inactivité** : le destinataire est prévenu quand il est inactif, ou à la fin
  de son tour. Il n'est jamais réveillé deux fois pour le même mail, et seul un nouveau mail le réveille.
- **Boîtes durables** : un fichier JSON par mail, conservé malgré les redémarrages du daemon. Le courrier
  d'un agent occupé l'attend.
- **Noms, rôles et ids** : écrivez à un nom, à `role:<rôle>`, à `agent:<id>`, ou à une liste. Un rôle
  atteint ses titulaires dans le workspace de l'expéditeur, sinon son projet, sinon partout.
- **Courrier retourné** : si un destinataire est archivé avant d'avoir lu, le mail revient à
  l'expéditeur sous la forme `Returned: <sujet>`.
- **Fils de discussion** : les réponses restent dans le même fil, et chaque résultat d'outil mail se
  termine par `Unread: N`, pour qu'un agent au travail voie le nouveau courrier sans être réveillé.
- **Un écran Mail pour les humains** : une entrée Mail dans la barre latérale de Paseo, présentée comme
  un client de messagerie : boîtes avec compteurs de non-lus, mails d'une boîte et lecteur avec tout le
  fil. Lecture seule : un humain ne peut ni écrire ni répondre à la place d'un agent, et ouvrir un mail
  ne compte jamais comme une lecture par l'agent.
- **Entretien des boîtes** : archiver et restaurer des boîtes, et tout marquer comme ouvert.
- **Traduit** : l'écran Mail est disponible en français et en chinois simplifié.

![L'écran Mail : les boîtes, les mails d'une boîte et un fil dans le lecteur](https://raw.githubusercontent.com/lerenn/paseo-mail/main/assets/mail-screen.png)

## Outils

| Outil | Rôle |
| --- | --- |
| `mail_register` | Réserver ou changer son nom et ses rôles |
| `mail_directory` | Lister les noms et rôles enregistrés |
| `mail_send` | Envoyer du courrier à des noms, rôles ou ids d'agent |
| `mail_list` | Lister son courrier, le plus récent d'abord |
| `mail_read` | Lire un mail et le marquer comme lu |
| `mail_reply` | Répondre dans le même fil |

## Pour commencer

- [Prise en main](https://mail.paseo.lerenn.dev/getting-started.html): installer le plugin et envoyer un premier mail.
- [Fonctionnement](https://mail.paseo.lerenn.dev/how-it-works.html): enregistrement, livraison et rappel.
- [Référence](https://mail.paseo.lerenn.dev/reference.html): outils, stockage et règle du courrier.

## Bon à savoir

- Un agent doit enregistrer un nom avant de pouvoir lire son courrier. D'ici là, `mail_list` et
  `mail_read` refusent et indiquent combien de mails attendent ; ils sont conservés et apparaissent
  dès l'enregistrement.
- La règle du courrier vit dans le prompt : le plugin ne peut pas bloquer les prompts directs entre
  agents. Les agents créés avant l'installation du plugin ne reçoivent pas la règle, mais ont les outils,
  le rappel et la ligne `Unread: N`.
- Nécessite Paseo 0.15 ou plus récent. Le courrier et le registre sont conservés dans
  `$PASEO_HOME/plugin-data/lerenn/mail/`.
