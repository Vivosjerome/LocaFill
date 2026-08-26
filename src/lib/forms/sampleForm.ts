export const SAMPLE_FORM_HTML = `<!doctype html>
<html lang="fr">
  <body>
    <h1>Dossier de location — immeuble Les Tilleuls</h1>
    <form id="rental">
      <fieldset>
        <legend>Applicant details</legend>
        <label>Family name <input name="family_nm" placeholder="Surname"></label>
        <label>Given name <input id="given" placeholder="First name"></label>
        <label>Date of birth <input type="date" name="dob"></label>
        <p>Nationality</p>
        <input name="citizenship">
      </fieldset>
      <fieldset>
        <legend>Coordonnées</legend>
        <label for="mail">Adresse e-mail</label>
        <input id="mail" type="email" name="contact_mail">
        <label>Numéro de téléphone portable <input type="tel" name="mobile"></label>
      </fieldset>
      <fieldset>
        <legend>Adresse actuelle</legend>
        <label>Street address <input name="addr1"></label>
        <label>ZIP / code postal <input name="zipcode"></label>
        <label>Town / city <input name="town"></label>
      </fieldset>
      <fieldset>
        <legend>Situation professionnelle</legend>
        <label>Job title <input name="role"></label>
        <label>Type de contrat
          <select name="contrat">
            <option></option>
            <option>CDI</option>
            <option>CDD</option>
            <option>Indépendant</option>
          </select>
        </label>
        <label>Company / employer <input name="org"></label>
        <label>Employer phone <input type="tel" name="hr_phone"></label>
      </fieldset>
      <fieldset>
        <legend>Ressources</legend>
        <label>Net mensuel / take-home pay (€) <input name="takehome" inputmode="decimal"></label>
        <label>Revenu fiscal de référence <input name="rfr"></label>
      </fieldset>
      <fieldset>
        <legend>Foyer</legend>
        <label>Nombre d'occupants <input type="number" name="occupants"></label>
        <label>Enfants à charge <input type="number" name="kids"></label>
      </fieldset>
      <button type="submit">Envoyer la candidature</button>
    </form>
  </body>
</html>`
