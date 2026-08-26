import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

const DOTS = '................................................'
const SHORT_DOTS = '................'

type Ctx = {
  doc: PDFDocument
  page: PDFPage
  font: PDFFont
}

function text(ctx: Ctx, value: string, x: number, y: number, size = 10) {
  ctx.page.drawText(value, { x, y, size, font: ctx.font, color: rgb(0, 0, 0) })
}

const COL = 200
const COL_END = 540

function line(ctx: Ctx, x1: number, x2: number, y: number) {
  ctx.page.drawLine({
    start: { x: x1, y },
    end: { x: x2, y },
    thickness: 0.7,
    color: rgb(0.2, 0.2, 0.2),
  })
}

function dashLine(ctx: Ctx, x1: number, x2: number, y: number) {
  ctx.page.drawLine({
    start: { x: x1, y },
    end: { x: x2, y },
    thickness: 0.65,
    color: rgb(0.28, 0.28, 0.28),
    dashArray: [1.1, 1.4],
  })
}

function labelFill(ctx: Ctx, label: string, y: number, fillX = COL) {
  text(ctx, label, 36, y)
  text(ctx, DOTS, fillX, y)
}

async function makePdf(drawPages: ((ctx: Ctx) => void)[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const draw of drawPages) {
    const page = doc.addPage([595, 842])
    draw({ doc, page, font })
  }
  return doc.save()
}

function twoColHeaders(ctx: Ctx, left: string, right: string, y = 760) {
  text(ctx, left, 180, y, 11)
  text(ctx, right, 400, y, 11)
}

function row(ctx: Ctx, label: string, y: number, leftX = 155, rightX = 400) {
  text(ctx, label, 36, y)
  text(ctx, DOTS, leftX, y)
  text(ctx, DOTS, rightX, y)
}

export async function sheetLocataire2ColsBoth(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche de renseignements Locataire', 36, 800, 14)
      text(ctx, 'SITUATION PERSONNELLE', 36, 780, 11)
      twoColHeaders(ctx, 'Locataire 1', 'Locataire 2')
      row(ctx, 'Nom & Prénom', 730)
      row(ctx, 'Date et lieu de naissance', 710)
      row(ctx, 'Adresse mail', 690)
      row(ctx, 'Téléphone portable', 670)
    },
  ])
}

export async function sheetLocataire2ColsLeftLabels(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Dossier de candidature locataires', 36, 800, 14)
      text(ctx, 'RENSEIGNEMENTS LOCATAIRE 1 LOCATAIRE 2', 36, 770, 11)
      twoColHeaders(ctx, 'Locataire 1', 'Locataire 2', 740)
      row(ctx, 'Nom, Prénom', 700)
      row(ctx, 'Mail', 680)
      row(ctx, 'Nationalité', 660)
      row(ctx, 'Téléphone fixe, portable', 640)
    },
  ])
}

export async function sheetLocataireSimple(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'FICHE CANDIDAT LOCATAIRE', 36, 800, 14)
      text(ctx, 'IDENTITÉ', 36, 770, 12)
      labelFill(ctx, 'Nom', 740)
      labelFill(ctx, 'Prénom', 720)
      labelFill(ctx, 'Adresse e-mail', 700)
      labelFill(ctx, 'Téléphone portable', 680)
    },
  ])
}

export async function sheetCautionnaire2Cols(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche de renseignements Cautionnaire', 36, 800, 14)
      twoColHeaders(ctx, 'Cautionnaire 1', 'Cautionnaire 2')
      row(ctx, 'Nom & Prénom', 730)
      row(ctx, 'Adresse mail', 710)
    },
  ])
}

export async function sheetCandidatureGarants(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Dossier de candidature locataires', 36, 800, 14)
      twoColHeaders(ctx, 'Locataire 1', 'Locataire 2')
      row(ctx, 'Nom, Prénom', 730)
      row(ctx, 'Mail', 710)
    },
    (ctx) => {
      text(ctx, 'Dossier de candidature garants', 36, 800, 14)
      text(ctx, 'RENSEIGNEMENTS LOCATAIRE 1 LOCATAIRE 2', 36, 770, 11)
      twoColHeaders(ctx, 'Locataire 1', 'Locataire 2', 740)
      row(ctx, 'Nom, Prénom', 700)
      row(ctx, 'Mail', 680)
    },
  ])
}

export async function sheetEmployer(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Attestation Employeur', 36, 800, 14)
      text(ctx, 'Je soussigné(e) Madame, Monsieur', 36, 760)
      text(ctx, 'Agissant en qualité de', 36, 740)
      text(ctx, DOTS, 200, 740)
      text(ctx, 'Nom et prénom du salarié', 36, 700)
      text(ctx, DOTS, 200, 700)
      text(ctx, 'Adresse du lieu de travail du salarié', 36, 680)
      text(ctx, DOTS, 250, 680)
      text(ctx, 'En Contrat à Durée Indéterminée - Depuis le', 36, 650)
    },
  ])
}

export async function sheetPiecesLocataire(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Pièces à fournir', 36, 800, 14)
      text(ctx, 'Bulletins de salaire', 36, 760)
      text(ctx, 'Avis d imposition', 36, 740)
      text(ctx, 'Pièce d identité', 36, 720)
    },
  ])
}

export async function sheetPiecesGarant(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Pièces à fournir', 36, 800, 14)
      text(ctx, 'Dossier garant', 36, 770)
      text(ctx, 'Attestation de la banque', 36, 740)
      text(ctx, 'Avis d imposition', 36, 720)
    },
  ])
}

export async function sheetRgpd(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'RGPD : traitement de vos données personnelles', 36, 800, 14)
      text(ctx, 'Qui est le responsable du traitement de vos données personnelles ?', 36, 760, 10)
      text(ctx, 'Nom', 36, 720)
      text(ctx, DOTS, 80, 720)
    },
  ])
}

export async function sheetHebergement(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Attestation d’Hébergement', 36, 800, 14)
      text(ctx, 'Je soussigné(e) Mademoiselle, Madame, Monsieur', 36, 760)
      text(ctx, 'Nom', 36, 720)
      text(ctx, DOTS, 80, 720)
    },
  ])
}

export async function sheetFoyerFiscal(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Attestation de Rattachement de Foyer Fiscal', 36, 800, 14)
      text(ctx, 'Nom', 36, 740)
      text(ctx, DOTS, 80, 740)
    },
  ])
}

export async function sheetAcroform(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche de renseignements locataire', 36, 800, 14)
      text(ctx, 'Nom', 36, 740)
      text(ctx, 'Prénom', 36, 710)
      text(ctx, 'Adresse e-mail', 36, 680)
      const form = ctx.doc.getForm()
      form.createTextField('nom').addToPage(ctx.page, { x: COL, y: 736, width: 280, height: 16 })
      form.createTextField('prenom').addToPage(ctx.page, { x: COL, y: 706, width: 280, height: 16 })
      form.createTextField('mail').addToPage(ctx.page, { x: COL, y: 676, width: 320, height: 16 })
    },
  ])
}

export async function sheetShortDotsEmail(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche de renseignements Locataire', 36, 800, 14)
      text(ctx, 'Locataire 1', 180, 760)
      text(ctx, 'Locataire 2', 400, 760)
      text(ctx, 'Nom & Prénom', 36, 720)
      text(ctx, SHORT_DOTS, 160, 720)
      text(ctx, SHORT_DOTS, 400, 720)
      text(ctx, 'Adresse mail', 36, 690)
      text(ctx, SHORT_DOTS, 160, 690)
      text(ctx, SHORT_DOTS, 400, 690)
    },
  ])
}

export async function sheetEnglish(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Rental application form', 36, 800, 14)
      labelFill(ctx, 'Last name', 740)
      labelFill(ctx, 'First name', 720)
      labelFill(ctx, 'Email', 700)
      labelFill(ctx, 'Phone', 680)
    },
  ])
}

export async function sheetNomDuGarant(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche de renseignements Locataire', 36, 800, 14)
      text(ctx, 'Nom & Prénom', 36, 740)
      text(ctx, DOTS, 160, 740)
      text(ctx, 'Adresse mail', 36, 720)
      text(ctx, DOTS, 160, 720)
      text(ctx, 'Nom du garant', 36, 680)
      text(ctx, DOTS, 160, 680)
    },
  ])
}

export async function sheetLoyerHonoraires(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Dossier de candidature locataires', 36, 800, 14)
      text(ctx, 'Loyer :', 36, 760)
      text(ctx, DOTS, 90, 760)
      text(ctx, 'Honoraires :', 36, 740)
      text(ctx, DOTS, 120, 740)
      text(ctx, 'Nom, Prénom', 36, 700)
      text(ctx, DOTS, 160, 700)
      text(ctx, 'Mail', 36, 680)
      text(ctx, DOTS, 160, 680)
    },
  ])
}

export async function sheetIdentiteDeuxPages(): Promise<Uint8Array> {
  const identity = (ctx: Ctx, title: string) => {
    text(ctx, title, 36, 800, 14)
    labelFill(ctx, 'Nom', 740)
    labelFill(ctx, 'Prénom', 720)
    labelFill(ctx, 'Date de naissance', 700)
    labelFill(ctx, 'Adresse e-mail', 680)
  }
  return makePdf([(ctx) => identity(ctx, 'Fiche locataire'), (ctx) => identity(ctx, 'Fiche locataire')])
}

export async function sheetSituationPro(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche de renseignements Locataire', 36, 800, 14)
      text(ctx, 'SITUATION PROFESSIONNELLE', 36, 760, 12)
      text(ctx, 'Nom de l’entreprise', 36, 730)
      text(ctx, DOTS, 180, 730)
      text(ctx, 'Adresse', 36, 710)
      text(ctx, DOTS, 120, 710)
      text(ctx, 'Situation actuelle', 36, 690)
      text(ctx, DOTS, 180, 690)
    },
  ])
}

export async function sheetCelibataire(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche de renseignements Locataire', 36, 800, 14)
      text(ctx, 'Célibataire', 56, 740)
      text(ctx, 'Marié', 56, 720)
      const form = ctx.doc.getForm()
      form.createCheckBox('celib').addToPage(ctx.page, { x: 36, y: 738, width: 12, height: 12 })
      form.createCheckBox('marie').addToPage(ctx.page, { x: 36, y: 718, width: 12, height: 12 })
    },
  ])
}

export async function sheetDateLieuNaissance(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche de renseignements Locataire', 36, 800, 14)
      text(ctx, 'Date et lieu de naissance', 36, 740)
      text(ctx, DOTS, 200, 740)
    },
  ])
}

export async function sheetCpVille(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche de renseignements Locataire', 36, 800, 14)
      text(ctx, 'Code postal et ville', 36, 740)
      text(ctx, DOTS, 180, 740)
    },
  ])
}

export async function sheetSoulignes(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche de renseignements Locataire', 36, 800, 14)
      text(ctx, 'Nom', 36, 740)
      line(ctx, COL, COL_END, 738)
      text(ctx, 'Prénom', 36, 710)
      line(ctx, COL, COL_END, 708)
      text(ctx, 'Adresse e-mail', 36, 680)
      line(ctx, COL, COL_END, 678)
    },
  ])
}

export async function sheetBlocIdentite(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche de renseignements Locataire', 36, 800, 14)
      labelFill(ctx, 'Nom', 740)
      labelFill(ctx, 'Prénom', 720)
      labelFill(ctx, 'Adresse e-mail', 700)
      labelFill(ctx, 'Téléphone portable', 680)
      labelFill(ctx, 'Adresse', 660)
      labelFill(ctx, 'Nationalité', 640)
    },
  ])
}

export async function sheetDeuxGarants(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche de renseignements Cautionnaire', 36, 800, 14)
      twoColHeaders(ctx, 'Garant 1', 'Garant 2')
      row(ctx, 'Nom & Prénom', 730)
      row(ctx, 'Adresse mail', 710)
    },
  ])
}

export async function sheetDocumentsAFournir(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'DOCUMENTS A FOURNIR PAR LES LOCATAIRES ET LES GARANTS', 36, 800, 12)
      text(ctx, 'Pièce d’identité', 36, 760)
      text(ctx, 'Les deux derniers avis d’imposition', 36, 740)
      text(ctx, 'Nom', 36, 700)
      text(ctx, DOTS, 80, 700)
    },
  ])
}

function rect(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    borderWidth: 0.85,
    borderColor: rgb(0.15, 0.15, 0.15),
  })
}

export async function sheetLabelAuDessus(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche locataire — libellé au-dessus', 36, 800, 14)
      text(ctx, 'Nom', 36, 760)
      text(ctx, DOTS, 36, 742)
      text(ctx, 'Prénom', 36, 710)
      text(ctx, DOTS, 36, 692)
      text(ctx, 'Adresse e-mail', 36, 660)
      text(ctx, DOTS, 36, 642)
    },
  ])
}

export async function sheetInlineNomPrenom(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche locataire — deux champs sur la même ligne', 36, 800, 14)
      text(ctx, 'Nom', 36, 740)
      text(ctx, DOTS, 70, 740)
      text(ctx, 'Prénom', 280, 740)
      text(ctx, DOTS, 330, 740)
      text(ctx, 'Adresse e-mail', 36, 700)
      text(ctx, DOTS, 160, 700)
    },
  ])
}

export async function sheetTroisColonnes(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche de renseignements Locataire', 36, 800, 14)
      text(ctx, 'Locataire 1', 110, 760, 11)
      text(ctx, 'Locataire 2', 290, 760, 11)
      text(ctx, 'Locataire 3', 470, 760, 11)
      const rows: [string, number][] = [
        ['Nom', 730],
        ['Mail', 700],
        ['Téléphone portable', 670],
      ]
      for (const [label, y] of rows) {
        text(ctx, label, 36, y)
        dashLine(ctx, 80, 195, y - 1)
        dashLine(ctx, 260, 375, y - 1)
        dashLine(ctx, 440, 555, y - 1)
      }
    },
  ])
}

export async function sheetCasesCadrees(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche locataire — cases encadrées', 36, 800, 14)
      text(ctx, 'Nom', 36, 742)
      rect(ctx, COL, 736, 340, 16)
      text(ctx, 'Prénom', 36, 712)
      rect(ctx, COL, 706, 340, 16)
      text(ctx, 'Adresse e-mail', 36, 682)
      rect(ctx, COL, 676, 340, 16)
    },
  ])
}

export async function sheetPhraseTrous(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche locataire — phrase à trous', 36, 800, 14)
      text(ctx, 'Nom et prénom', 36, 740)
      text(ctx, DOTS, 140, 740)
      text(ctx, 'Date de naissance', 36, 710)
      text(ctx, SHORT_DOTS, 160, 710)
      text(ctx, 'à', 230, 710)
      text(ctx, DOTS, 250, 710)
      text(ctx, 'Adresse e-mail', 36, 680)
      text(ctx, DOTS, 160, 680)
    },
  ])
}

export async function sheetLabelsDroite(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche locataire — libellés collés à la ligne', 36, 800, 14)
      const row = (label: string, y: number, lineX: number) => {
        const w = ctx.font.widthOfTextAtSize(label, 10)
        text(ctx, label, lineX - 8 - w, y)
        text(ctx, DOTS, lineX, y)
      }
      row('Nom', 740, 200)
      row('Prénom', 710, 200)
      row('Adresse e-mail', 680, 200)
    },
  ])
}

export async function sheetQuestionDessous(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche locataire — question puis ligne en dessous', 36, 800, 14)
      text(ctx, 'Adresse :', 36, 740)
      text(ctx, DOTS, 36, 720)
      text(ctx, DOTS, 180, 720)
      text(ctx, 'Code postal et ville', 36, 680)
      text(ctx, DOTS, 36, 660)
    },
  ])
}

export async function sheetSignatureBas(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche locataire', 36, 800, 14)
      labelFill(ctx, 'Nom', 740)
      labelFill(ctx, 'Prénom', 720)
      text(ctx, 'Fait à', 36, 90)
      text(ctx, DOTS, 80, 90)
      text(ctx, 'Le', 300, 90)
      text(ctx, SHORT_DOTS, 330, 90)
      text(ctx, 'Signature du locataire', 36, 60)
    },
  ])
}

export async function sheetTableauIdentite(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche locataire — tableau', 36, 800, 14)
      text(ctx, 'Rubrique', 44, 772)
      text(ctx, 'A remplir', 220, 772)
      text(ctx, 'Nom', 44, 742)
      rect(ctx, 200, 736, 340, 18)
      text(ctx, 'Prénom', 44, 712)
      rect(ctx, 200, 706, 340, 18)
      text(ctx, 'Adresse e-mail', 44, 682)
      rect(ctx, 200, 676, 340, 18)
    },
  ])
}

export async function sheetCartesEmpilees(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Dossier locataires — cartes séparées', 36, 810, 14)
      rect(ctx, 36, 560, 523, 230)
      text(ctx, 'Locataire 1', 48, 770, 12)
      text(ctx, 'Nom', 48, 740)
      text(ctx, DOTS, 180, 740)
      text(ctx, 'Prénom', 48, 715)
      text(ctx, DOTS, 180, 715)
      text(ctx, 'Adresse e-mail', 48, 690)
      text(ctx, DOTS, 180, 690)
      text(ctx, 'Téléphone portable', 48, 665)
      text(ctx, DOTS, 180, 665)

      rect(ctx, 36, 300, 523, 230)
      text(ctx, 'Locataire 2', 48, 510, 12)
      text(ctx, 'Nom', 48, 480)
      text(ctx, DOTS, 180, 480)
      text(ctx, 'Prénom', 48, 455)
      text(ctx, DOTS, 180, 455)
      text(ctx, 'Adresse e-mail', 48, 430)
      text(ctx, DOTS, 180, 430)
      text(ctx, 'Téléphone portable', 48, 405)
      text(ctx, DOTS, 180, 405)
    },
  ])
}

export async function sheetCerfaNumerote(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'CERFA — Dossier de location', 36, 800, 14)
      text(ctx, 'Cadre réservé au candidat locataire', 36, 778, 10)
      const rows: [string, number][] = [
        ['1. Nom de famille', 742],
        ['2. Prénom', 712],
        ['3. Date de naissance', 682],
        ['4. Nationalité', 652],
        ['5. Adresse e-mail', 622],
        ['6. Téléphone portable', 592],
        ['7. Adresse', 562],
      ]
      for (const [label, y] of rows) {
        text(ctx, label, 36, y)
        rect(ctx, 220, y - 6, 330, 18)
      }
    },
  ])
}

export async function sheetTableauDeuxCols(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Grille de candidature', 36, 800, 14)
      rect(ctx, 36, 600, 523, 180)
      text(ctx, 'Rubrique', 44, 760)
      text(ctx, 'Locataire 1', 190, 760, 11)
      text(ctx, 'Locataire 2', 400, 760, 11)
      line(ctx, 36, 559, 752)
      const rows: [string, number][] = [
        ['Nom', 722],
        ['Prénom', 692],
        ['Adresse e-mail', 662],
        ['Téléphone portable', 632],
      ]
      for (const [label, y] of rows) {
        text(ctx, label, 44, y)
        rect(ctx, 160, y - 6, 130, 20)
        rect(ctx, 330, y - 6, 200, 20)
      }
    },
  ])
}

export async function sheetPhotoIdentite(): Promise<Uint8Array> {
  return makePdf([
    (ctx) => {
      text(ctx, 'Fiche locataire — identité + photo', 36, 800, 14)
      rect(ctx, 400, 400, 155, 175)
      text(ctx, 'Photo', 448, 480, 11)
      labelFill(ctx, 'Nom', 760)
      labelFill(ctx, 'Prénom', 735)
      labelFill(ctx, 'Date de naissance', 710)
      labelFill(ctx, 'Adresse e-mail', 685)
      labelFill(ctx, 'Téléphone portable', 660)
      labelFill(ctx, 'Nationalité', 635)
    },
  ])
}

export type SheetAnchor = { label: string; role: 'primary' | 'cotenant' | 'guarantor'; x: number; y: number }

export const GENERATED_SHEETS: { id: string; title: string; build: () => Promise<Uint8Array>; anchors?: SheetAnchor[] }[] = [
  { id: '01-locataire-2cols', title: 'Locataire 2 colonnes (libelles des deux cotes)', build: sheetLocataire2ColsBoth, anchors: [
    { label: 'Nom & Prénom', role: 'primary', x: 155, y: 730 },
    { label: 'Nom & Prénom', role: 'cotenant', x: 400, y: 730 },
    { label: 'Adresse mail', role: 'primary', x: 155, y: 690 },
    { label: 'Adresse mail', role: 'cotenant', x: 400, y: 690 },
  ] },
  { id: '02-locataire-labels-gauche', title: 'Locataire 2 colonnes (libelles a gauche seulement)', build: sheetLocataire2ColsLeftLabels, anchors: [
    { label: 'Nom, Prénom', role: 'primary', x: 155, y: 700 },
    { label: 'Nom, Prénom', role: 'cotenant', x: 400, y: 700 },
  ] },
  { id: '03-locataire-simple', title: 'Fiche candidat locataire simple (style ERA)', build: sheetLocataireSimple, anchors: [
    { label: 'Nom', role: 'primary', x: 200, y: 740 },
    { label: 'Prénom', role: 'primary', x: 200, y: 720 },
    { label: 'Adresse e-mail', role: 'primary', x: 200, y: 700 },
  ] },
  { id: '04-cautionnaire', title: 'Fiche cautionnaire 2 colonnes', build: sheetCautionnaire2Cols },
  { id: '05-candidature-garants', title: 'Page locataires + page candidature garants', build: sheetCandidatureGarants },
  { id: '06-attestation-employeur', title: 'Attestation employeur', build: sheetEmployer },
  { id: '07-pieces-locataire', title: 'Liste pieces locataire (a ignorer)', build: sheetPiecesLocataire },
  { id: '08-pieces-garant', title: 'Liste pieces garant (a ignorer)', build: sheetPiecesGarant },
  { id: '09-rgpd', title: 'Page RGPD (a ignorer)', build: sheetRgpd },
  { id: '10-hebergement', title: 'Attestation hebergement (a ignorer)', build: sheetHebergement },
  { id: '11-foyer-fiscal', title: 'Attestation foyer fiscal (a ignorer)', build: sheetFoyerFiscal },
  { id: '12-acroform', title: 'PDF Acrobat avec vrais champs', build: sheetAcroform },
  { id: '13-pointilles-courts', title: 'Pointilles trop courts (mail ne doit pas etre coupe)', build: sheetShortDotsEmail },
  { id: '14-anglais', title: 'Formulaire anglais', build: sheetEnglish },
  { id: '15-nom-du-garant', title: 'Champ Nom du garant sur fiche locataire', build: sheetNomDuGarant },
  { id: '16-loyer-honoraires', title: 'En-tete loyer/honoraires + identite', build: sheetLoyerHonoraires },
  { id: '17-identite-2-pages', title: 'Deux pages identite identiques (locataire 1 puis 2)', build: sheetIdentiteDeuxPages },
  { id: '18-situation-pro', title: 'Situation professionnelle / employeur', build: sheetSituationPro },
  { id: '19-celibataire', title: 'Cases situation familiale', build: sheetCelibataire },
  { id: '20-date-lieu-naissance', title: 'Date et lieu de naissance', build: sheetDateLieuNaissance },
  { id: '21-cp-ville', title: 'Code postal et ville', build: sheetCpVille },
  { id: '22-soulignes', title: 'Lignes soulignees (pas de pointilles)', build: sheetSoulignes, anchors: [
    { label: 'Nom', role: 'primary', x: 200, y: 740 },
    { label: 'Prénom', role: 'primary', x: 200, y: 710 },
    { label: 'Adresse e-mail', role: 'primary', x: 200, y: 680 },
  ] },
  { id: '23-bloc-identite', title: 'Bloc identite complet', build: sheetBlocIdentite },
  { id: '24-deux-garants', title: 'Deux colonnes Garant 1 / Garant 2', build: sheetDeuxGarants },
  { id: '25-documents-fournir', title: 'Documents a fournir (a ignorer)', build: sheetDocumentsAFournir },
  { id: '27-label-dessus', title: 'Libelle au-dessus de la ligne', build: sheetLabelAuDessus, anchors: [
    { label: 'Nom', role: 'primary', x: 36, y: 742 },
    { label: 'Prénom', role: 'primary', x: 36, y: 692 },
  ] },
  { id: '28-inline-nom-prenom', title: 'Nom et prenom sur la meme ligne', build: sheetInlineNomPrenom, anchors: [
    { label: 'Nom', role: 'primary', x: 70, y: 740 },
    { label: 'Prénom', role: 'primary', x: 330, y: 740 },
  ] },
  { id: '29-trois-colonnes', title: 'Trois colonnes locataire 1 / 2 / 3', build: sheetTroisColonnes, anchors: [
    { label: 'Nom', role: 'primary', x: 80, y: 731 },
    { label: 'Nom', role: 'cotenant', x: 260, y: 731 },
  ] },
  { id: '30-cases-cadrees', title: 'Cases encadrees', build: sheetCasesCadrees, anchors: [
    { label: 'Nom', role: 'primary', x: 200, y: 740 },
    { label: 'Prénom', role: 'primary', x: 200, y: 710 },
  ] },
  { id: '31-phrase-trous', title: 'Phrase a trous (nom / date / a)', build: sheetPhraseTrous, anchors: [
    { label: 'Nom et prénom', role: 'primary', x: 140, y: 740 },
    { label: 'Adresse e-mail', role: 'primary', x: 160, y: 680 },
  ] },
  { id: '32-labels-droite', title: 'Libelles colles juste avant la ligne', build: sheetLabelsDroite, anchors: [
    { label: 'Nom', role: 'primary', x: 200, y: 740 },
    { label: 'Prénom', role: 'primary', x: 200, y: 710 },
  ] },
  { id: '33-question-dessous', title: 'Question puis ligne en dessous', build: sheetQuestionDessous, anchors: [
    { label: 'Adresse', role: 'primary', x: 36, y: 720 },
    { label: 'Code postal et ville', role: 'primary', x: 36, y: 660 },
  ] },
  { id: '34-signature-bas', title: 'Identite en haut, fait a / le en bas', build: sheetSignatureBas, anchors: [
    { label: 'Nom', role: 'primary', x: 200, y: 740 },
    { label: 'Prénom', role: 'primary', x: 200, y: 720 },
  ] },
  { id: '35-tableau', title: 'Tableau rubrique / a remplir', build: sheetTableauIdentite, anchors: [
    { label: 'Nom', role: 'primary', x: 200, y: 740 },
    { label: 'Prénom', role: 'primary', x: 200, y: 710 },
  ] },
  { id: '36-cartes-empilees', title: 'Deux cartes Locataire 1 puis Locataire 2', build: sheetCartesEmpilees, anchors: [
    { label: 'Nom', role: 'primary', x: 180, y: 740 },
    { label: 'Nom', role: 'cotenant', x: 180, y: 480 },
    { label: 'Adresse e-mail', role: 'primary', x: 180, y: 690 },
    { label: 'Adresse e-mail', role: 'cotenant', x: 180, y: 430 },
  ] },
  { id: '37-cerfa-numerote', title: 'CERFA champs numerotes dans des cases', build: sheetCerfaNumerote, anchors: [
    { label: '1. Nom de famille', role: 'primary', x: 220, y: 740 },
    { label: '2. Prénom', role: 'primary', x: 220, y: 710 },
    { label: '5. Adresse e-mail', role: 'primary', x: 220, y: 620 },
  ] },
  { id: '38-grille-2cols', title: 'Grille cases Locataire 1 / Locataire 2', build: sheetTableauDeuxCols, anchors: [
    { label: 'Nom', role: 'primary', x: 160, y: 720 },
    { label: 'Nom', role: 'cotenant', x: 330, y: 720 },
  ] },
  { id: '39-photo-identite', title: 'Identite alignee + encadre photo', build: sheetPhotoIdentite, anchors: [
    { label: 'Nom', role: 'primary', x: 200, y: 760 },
    { label: 'Prénom', role: 'primary', x: 200, y: 735 },
    { label: 'Adresse e-mail', role: 'primary', x: 200, y: 685 },
  ] },
]
