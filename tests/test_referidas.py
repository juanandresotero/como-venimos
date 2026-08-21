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


if __name__ == "__main__":
    unittest.main()
