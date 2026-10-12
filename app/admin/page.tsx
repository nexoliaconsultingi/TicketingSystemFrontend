import { redirect } from "next/navigation"

/**
 * Accueil de la section d'administration.
 *
 * `/admin` n'a pas de page propre : le groupe « Support » de la barre latérale
 * mène à `/` et à `/admin/tickets`. Sans cette route, saisir ou favoriser
 * « /admin » renvoie l'écran 404 de Next, sur un URL pourtant correct — c'est la
 * seule entrée du préfixe `/admin` qui manque, toutes les autres ayant leur page.
 *
 * L'envoi se fait vers le centre de répartition, qui est la première décision que
 * l'administration prend sur un dossier.
 */
export default function AdminIndexPage() {
  redirect("/admin/tickets")
}
