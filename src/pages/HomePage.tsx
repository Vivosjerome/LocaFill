import { Link } from 'react-router-dom'

export function HomePage() {
  return (
    <div className="home">
      <h1>LocaFill</h1>
      <p className="lede">
        Un profil pour remplir les dossiers de location. Rien ne quitte votre téléphone.
      </p>
      <div className="home-actions">
        <Link to="/profile" className="btn btn-primary">
          Mon profil
        </Link>
        <Link to="/analyzer" className="btn btn-ghost">
          Analyser un dossier
        </Link>
      </div>
      <p className="muted home-hint">1. Profil · 2. Importer le PDF · 3. Vérifier · 4. Télécharger</p>
    </div>
  )
}
