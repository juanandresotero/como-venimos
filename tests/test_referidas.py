"""Seguir las propiedades que Juan le refirio a un colega.

Juan: "cuando alguien refiere algo los agentes que recibieron mi referido no me informan de
como viene la cosa y este sistema que te planteo aca me garantiza enterarme".
"""
from __future__ import annotations

import unittest

from robot import agentes, referidas

HOY = "2026-08-21"
COLEGA = "ag-pepito"


class TestReferidas(unittest.TestCase):
    def negocio(self, **extra):
        base = {
            "id": "manual-7",
            "yo_referi": True,
            "estado": "en_curso",
            "direccion": "Flammarión 5046",
            "precio_operacion": 120000,
            "referido_a_agente": COLEGA,
        }
        base.update(extra)
        return base

    def listing(self, **extra):
        base = {
            "entityId": "p-colega",
            "displayAddress": "Flammarion 5000",
            "price": 120000.0,
            "currency": {"id": 1.0, "value": "USD"},
            "operation": {"id": 1.0, "value": "sale"},
            "listingStatus": {"id": 1.0, "value": "active"},
            "location": {"name": "Malvín Norte"},
            "title": "Casa en Malvín Norte",
        }
        base.update(extra)
        return base

    def mirar(self, negocios, propiedades, previo=None):
        return referidas.mirar(negocios, previo, HOY, lambda _: propiedades)

    def tipos(self, avisos):
        return [a["tipo"] for a in avisos]

# ---------------------------------------------------------------- a quien seguir
    def test_solo_se_siguen_las_referidas_abiertas_con_colega_elegido(self):
        """Una cerrada o caida ya se sabe como termino. Y sin colega de la guia no hay a quien
        mirarle la cartera: es el caso de las referidas viejas del Excel, con el nombre a mano."""
        a_seguir = referidas.a_quien_seguir([
            self.negocio(id="viva"),
            self.negocio(id="cerrada", estado="cerrado"),
            self.negocio(id="caida", estado="caido"),
            self.negocio(id="sin-colega", referido_a_agente=None),
            {"id": "no-referida", "estado": "en_curso"},
        ])
        assert a_seguir == {COLEGA: [{**self.negocio(id="viva")}]}

    def test_una_sola_llamada_por_colega_aunque_le_refieras_tres(self):
        llamadas = []

        def traer(agente):
            llamadas.append(agente)
            return [self.listing()]

        referidas.mirar(
            [self.negocio(id="a"), self.negocio(id="b"), self.negocio(id="c")], None, HOY, traer)
        assert llamadas == [COLEGA], "tres referidas al mismo colega, una sola cartera"

# ---------------------------------------------------------------- paso 2: ubicarla
    def test_avisa_cuando_el_colega_publica_algo_que_puede_ser_tuyo(self):
        visto, avisos = self.mirar([self.negocio()], [self.listing()])
        assert self.tipos(avisos) == ["referida_candidata"]
        assert "¿Es la que le referiste?" in avisos[0]["detalle"]
        assert avisos[0]["entity_id"] == "p-colega"
        assert visto["negocios"]["manual-7"]["candidatas"][0]["entity_id"] == "p-colega"

    def test_la_misma_candidata_no_vuelve_a_avisar_todos_los_dias(self):
        """Sin esto, la bandeja se llena del mismo aviso hasta que Juan lo conteste."""
        ayer, _ = self.mirar([self.negocio()], [self.listing()])
        _, avisos = self.mirar([self.negocio()], [self.listing()], ayer)
        assert avisos == []

    def test_una_candidata_descartada_no_vuelve(self):
        """Si le preguntaste al colega y te dijo que no, no hay que volver a preguntarle."""
        visto, avisos = self.mirar(
            [self.negocio(referido_descartadas=["p-colega"])], [self.listing()])
        assert avisos == []
        assert visto["negocios"]["manual-7"]["candidatas"] == []

    def test_una_propiedad_de_otra_calle_no_es_candidata(self):
        """El cruce por barrio devolvia basura: la calle es obligatoria."""
        _, avisos = self.mirar([self.negocio()], [self.listing(displayAddress="Gutenberg 6100")])
        assert avisos == []

# ---------------------------------------------------------------- paso 3: seguirla
    def confirmada(self, **extra):
        return self.negocio(referido_entity_id="p-colega", **extra)

    def test_avisa_cuando_pasa_a_negociacion(self):
        ayer, _ = self.mirar([self.confirmada()], [self.listing()])
        _, avisos = self.mirar(
            [self.confirmada()],
            [self.listing(listingStatus={"value": "negotiation"})],
            ayer)
        assert self.tipos(avisos) == ["referida_avanzo"]
        assert "de publicada a en negociación" in avisos[0]["detalle"]

    def test_una_venta_que_salta_de_publicada_a_reservada_tambien_avisa(self):
        """Juan: "capaz que el colega nunca puso negociacion una venta y la mando directo a
        reservado porque es nuevo y no sabe como funciona el sistema"."""
        ayer, _ = self.mirar([self.confirmada()], [self.listing()])
        _, avisos = self.mirar(
            [self.confirmada()], [self.listing(listingStatus={"value": "reservada"})], ayer)
        assert self.tipos(avisos) == ["referida_avanzo"]
        assert "de publicada a reservada" in avisos[0]["detalle"]

    def test_sin_cambios_no_avisa_nada(self):
        ayer, _ = self.mirar([self.confirmada()], [self.listing()])
        _, avisos = self.mirar([self.confirmada()], [self.listing()], ayer)
        assert avisos == []

    def test_avisa_si_el_colega_le_cambia_el_precio(self):
        ayer, _ = self.mirar([self.confirmada()], [self.listing()])
        _, avisos = self.mirar([self.confirmada()], [self.listing(price=110000.0)], ayer)
        assert self.tipos(avisos) == ["referida_cambio_precio"]
        assert "120.000 → 110.000" in avisos[0]["detalle"]

# ---------------------------------------------------------------- paso 4: se fue del portal
    def test_cuando_deja_de_estar_publicada_pregunta_como_termino(self):
        ayer, _ = self.mirar([self.confirmada()], [self.listing(listingStatus={"value": "reservada"})])
        visto, avisos = self.mirar([self.confirmada()], [], ayer)
        assert self.tipos(avisos) == ["referida_se_fue"]
        assert "Estaba reservada" in avisos[0]["detalle"]
        assert "¿Se vendió o se cayó?" in avisos[0]["detalle"]
        assert visto["negocios"]["manual-7"]["propiedad"]["activa"] is False

    def test_no_pregunta_dos_veces_que_paso(self):
        """Una vez que se fue, se fue: repetirlo cada dia no agrega nada."""
        ayer, _ = self.mirar([self.confirmada()], [self.listing()])
        anteayer, _ = self.mirar([self.confirmada()], [], ayer)
        _, avisos = self.mirar([self.confirmada()], [], anteayer)
        assert avisos == []

    def test_lo_que_se_guarda_de_una_propiedad_ajena_es_lo_justo(self):
        """Es la propiedad de otro: se guarda lo que hace falta para seguirla, nada mas."""
        visto, _ = self.mirar([self.confirmada()], [self.listing()])
        p = visto["negocios"]["manual-7"]["propiedad"]
        assert p["direccion"] == "Flammarion 5000"
        assert p["precio"] == 120000.0
        assert p["moneda"] == "USD"
        assert p["operacion"] == "venta"
        assert p["estado"] == "publicada"
        assert p["visto_primera_vez"] == HOY
        assert "photos" not in p and "descripcion" not in p

    def test_un_alquiler_se_lee_como_alquiler(self):
        visto, _ = self.mirar([self.confirmada()], [self.listing(operation={"value": "rent"})])
        assert visto["negocios"]["manual-7"]["propiedad"]["operacion"] == "alquiler"



class TestCadaCuantoSeBajaLaGuia(unittest.TestCase):
    """Juan: "capaz esto lo hace menos frecuente, 1 vez cada 2 o 3 dias". La cartera cambia
    todos los dias, pero que entre o salga un agente de RE/MAX es cosa de meses."""

    def test_sin_guia_todavia_se_baja(self):
        self.assertTrue(agentes.toca_bajarla(None, "2026-08-21"))
        self.assertTrue(agentes.toca_bajarla({}, "2026-08-21"))

    def test_recien_bajada_no_se_vuelve_a_bajar(self):
        guia = {"bajada_el": "2026-08-21"}
        self.assertFalse(agentes.toca_bajarla(guia, "2026-08-21"))
        self.assertFalse(agentes.toca_bajarla(guia, "2026-08-23"))

    def test_a_los_tres_dias_si(self):
        self.assertTrue(agentes.toca_bajarla({"bajada_el": "2026-08-21"}, "2026-08-24"))

    def test_una_guia_del_futuro_se_baja_igual(self):
        """El reloj de la maquina anda mal o se probo con FECHA_HOY. Es preferible una
        llamada de mas que quedarse pegado para siempre con una guia que nunca se renueva."""
        self.assertTrue(agentes.toca_bajarla({"bajada_el": "2027-01-01"}, "2026-08-21"))

    def test_una_fecha_rota_no_deja_a_la_guia_congelada(self):
        self.assertTrue(agentes.toca_bajarla({"bajada_el": "no es una fecha"}, "2026-08-21"))


class TestConElLinkPegado(unittest.TestCase):
    """Juan: "agregale que pueda directamente poner el link de la propiedad para que le haga
    seguimiento y no tengo que buscar el match".

    Con el link no hay nada que adivinar: ES esa. No hace falta el colega, ni la cartera de
    nadie, ni confirmar candidatas."""

    SLUG = "venta-casa-en-malvin-norte"

    def negocio(self, **extra):
        base = {
            "id": "manual-8", "yo_referi": True, "estado": "en_curso",
            "direccion": "Flammarión 5046", "referido_slug": self.SLUG,
        }
        base.update(extra)
        return base

    def listing(self, **extra):
        base = {
            "slug": self.SLUG, "internalId": "UY.42.9", "entityId": None,
            "displayAddress": "Flammarion 5000", "price": 120000.0,
            "currency": {"value": "USD"}, "operation": {"value": "sale"},
            "listingStatus": {"value": "active"}, "location": {"name": "Malvín Norte"},
        }
        base.update(extra)
        return base

    def mirar(self, negocios, propiedad, previo=None):
        return referidas.mirar(
            negocios, previo, HOY,
            lambda _: self.fail("no tiene que pedir la cartera de nadie"),
            lambda slug: propiedad if slug == self.SLUG else None)

    def test_con_link_no_le_pide_la_cartera_a_nadie(self):
        visto, avisos = self.mirar([self.negocio()], self.listing())
        assert visto["negocios"]["manual-8"]["propiedad"]["direccion"] == "Flammarion 5000"
        assert visto["negocios"]["manual-8"]["candidatas"] == [], "no hay nada que confirmar"

    def test_avisa_el_dia_que_el_colega_la_publica(self):
        """Con el link pegado el dia que se la referis, esto es la primera noticia que tenes
        de que el colega hizo algo. Hasta ahora dependia de que el se acordara de contarlo."""
        _, avisos = self.mirar([self.negocio()], self.listing())
        assert [a["tipo"] for a in avisos] == ["referida_avanzo"]
        assert "ya la publicó" in avisos[0]["detalle"]
        assert "120.000 USD" in avisos[0]["detalle"]

    def test_todavia_sin_publicar_no_dice_nada(self):
        visto, avisos = self.mirar([self.negocio()], None)
        assert avisos == []
        assert visto["negocios"]["manual-8"]["propiedad"] is None

    def test_despues_sigue_igual_que_una_confirmada_a_mano(self):
        ayer, _ = self.mirar([self.negocio()], self.listing())
        _, avisos = self.mirar(
            [self.negocio()], self.listing(listingStatus={"value": "reservada"}), ayer)
        assert [a["tipo"] for a in avisos] == ["referida_avanzo"]
        assert "de publicada a reservada" in avisos[0]["detalle"]

    def test_cuando_desaparece_pregunta_como_termino(self):
        ayer, _ = self.mirar([self.negocio()], self.listing())
        _, avisos = self.mirar([self.negocio()], None, ayer)
        assert [a["tipo"] for a in avisos] == ["referida_se_fue"]

    def test_se_guarda_el_numero_interno_que_no_cambia_nunca(self):
        """El slug sale del titulo: si el colega le cambia el titulo, el link muere. El numero
        interno no cambia y permite volver a encontrarla."""
        visto, _ = self.mirar([self.negocio()], self.listing())
        p = visto["negocios"]["manual-8"]["propiedad"]
        assert p["internal_id"] == "UY.42.9"
        assert p["slug"] == self.SLUG

    def test_una_con_link_no_entra_en_la_ronda_por_cartera(self):
        """Si entrara en las dos, se pediria la cartera del colega al pedo y ademas se le
        buscarian candidatas a una propiedad que ya sabemos cual es."""
        assert referidas.a_quien_seguir([self.negocio(referido_a_agente="ag-x")]) == {}
        assert [n["id"] for n in referidas.las_del_link([self.negocio()])] == ["manual-8"]


class TestDeDondeSaleCadaDato(unittest.TestCase):
    """Los mismos datos vienen en campos distintos segun de donde se pida la propiedad, y eso
    ya se cobro una: `location` NO es el barrio en ninguno de los dos casos —son las
    coordenadas— y el barrio quedaba vacio sin que nada avisara."""

    def test_el_barrio_de_la_lista_de_un_agente(self):
        p = referidas._propiedad({"geoLabel": "La Blanqueada, La Blanqueada, Montevideo"})
        self.assertEqual(p["barrio"], "La Blanqueada")

    def test_el_barrio_de_una_pedida_por_su_slug(self):
        p = referidas._propiedad({"geo": {"countie": "la blanqueada", "label": "otra cosa"}})
        self.assertEqual(p["barrio"], "La Blanqueada")

    def test_las_coordenadas_no_son_el_barrio(self):
        p = referidas._propiedad({"location": {"type": "Point", "coordinates": [-56.1, -34.8]}})
        self.assertEqual(p["barrio"], "")

    def test_el_uuid_de_la_lista_viene_en_entityId(self):
        p = referidas._propiedad({"entityId": "289eef8c-1a9c-4417-b483-8875104847ac", "id": 31719})
        self.assertEqual(p["entity_id"], "289eef8c-1a9c-4417-b483-8875104847ac")

    def test_el_uuid_de_una_pedida_por_slug_viene_en_id(self):
        """Ahi `entityId` viene en null y el uuid esta en `id`. Mismo dato, dos nombres."""
        p = referidas._propiedad({"entityId": None, "id": "289eef8c-1a9c-4417-b483-8875104847ac"})
        self.assertEqual(p["entity_id"], "289eef8c-1a9c-4417-b483-8875104847ac")

    def test_un_id_numerico_no_es_un_uuid(self):
        """En la lista `id` es un numero de cinco cifras. Tomarlo por uuid haria que dos
        propiedades distintas parecieran la misma."""
        self.assertIsNone(referidas._propiedad({"entityId": None, "id": 31719})["entity_id"])


if __name__ == "__main__":
    unittest.main()
