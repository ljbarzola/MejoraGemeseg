import { Module } from '@nestjs/common';
import { CacaoSuppliersModule } from './suppliers/suppliers.module';
import { CacaoClientsModule } from './clients/clients.module';
import { CacaoReceptionsModule } from './receptions/receptions.module';
import { CacaoLotsModule } from './lots/lots.module';
import { CacaoSettlementsModule } from './settlements/settlements.module';
import { CacaoPriceFixingsModule } from './price-fixings/price-fixings.module';
import { CacaoKardexModule } from './kardex/kardex.module';
import { CacaoShipmentsModule } from './shipments/shipments.module';
import { CacaoPayablesModule } from './payables/payables.module';
import { CacaoReceivablesModule } from './receivables/receivables.module';
import { CacaoDashboardModule } from './dashboard/dashboard.module';
import { CacaoQualitiesModule } from './qualities/qualities.module';
import { CacaoUnitConfigModule } from './unit-config/unit-config.module';

@Module({
  imports: [
    CacaoSuppliersModule,
    CacaoQualitiesModule,
    CacaoClientsModule,
    CacaoReceptionsModule,
    CacaoLotsModule,
    CacaoSettlementsModule,
    CacaoPriceFixingsModule,
    CacaoKardexModule,
    CacaoShipmentsModule,
    CacaoPayablesModule,
    CacaoReceivablesModule,
    CacaoDashboardModule,
    CacaoUnitConfigModule,
  ],
})
export class CacaoModule {}
