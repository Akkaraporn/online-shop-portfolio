import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Logger } from 'pino';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { LOGGER } from '../common/logging/logger.module';
import { ProblemException } from '../common/problem/problem.exception';
import { createValidationPipe } from '../common/problem/validation';
import { ENV, type Env } from '../config/config.module';
import type { PaymentView } from '../orders/order.types';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { PaymentIdParam } from './dto/payment-id.param';
import { WebhookEventDto } from './dto/webhook-event.dto';
import { PaymentsService } from './payments.service';
import { SIGNATURE_HEADER, verifyWebbookSignature } from './webhook-signature';
import { WebhookService, type WebhookAck } from './webhook.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * Submits a payment for processing.
   *
   * Marks it `processing` and hands it to the provider. The order is **not** fulfilled
   * here — the webhook does that. See PaymentsService for why the asymmetry is kept.
   */
  @Post(':paymentId/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @Param() params: PaymentIdParam,
    @Body() dto: ConfirmPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaymentView> {
    return this.payments.confirm(params.paymentId, user.id, dto.cardNumber);
  }
}

@Controller('webhooks')
export class WebhooksController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly webhooks: WebhookService,
  ) {}

  /**
   * The provider callback. Authenticated by HMAC, not by a bearer token.
   *
   * **Always answers 200**, for every outcome except a signature that does not verify:
   * an applied event, a duplicate, an unrecognised type, and even an event that could
   * not be processed. A non-2xx makes a real provider retry on a schedule of its own
   * choosing, forever, for something that will fail identically every time. Failures
   * are logged with the traceId and dealt with by a person.
   *
   * The signature is verified over `req.rawBody` — the exact bytes received. Verifying
   * a re-serialised body fails, because key order and whitespace change in the round
   * trip, and the usual symptom is a signature check that works in tests (where the
   * test builds the body) and fails against the real provider.
   *
   * The body is validated *after* the signature, by hand, which is why it is taken as
   * `unknown` (the global pipe skips that). Validating first, as `@Body() dto` would,
   * answers an unsigned request with 422 instead of 401, and a signed but malformed
   * event with 422 instead of 200 — both found by Schemathesis.
   */
  @Post('payment')
  @Public()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Body() body: unknown,
    @Req() request: Request & { rawBody?: Buffer },
  ): Promise<WebhookAck> {
    const presented = request.header(SIGNATURE_HEADER);
    const rawBody = request.rawBody;

    if (!rawBody) {
      // `rawBody: true` was not passed to NestFactory.create. A configuration error
      // rather than a caller error, and failing closed is the only safe response.
      this.logger.error(
        'raw body unavailable; NestFactory must be created with rawBody: true',
      );
      throw unauthorizedWebhook();
    }

    if (!verifyWebbookSignature(this.env.PAYMENT_WEBHOOK_SECRET, rawBody, presented)) {
      // The one case that is not a 200. An unsigned or wrongly-signed request is not
      // from the provider, so there is nothing to acknowledge.
      this.logger.warn({ hasSignature: Boolean(presented) }, 'webhook signature rejected');
      throw unauthorizedWebhook();
    }

    let event: WebhookEventDto;
    try {
      event = await createValidationPipe().transform(body, {
        type: 'body',
        metatype: WebhookEventDto,
      });
    } catch (error) {
      // Signed by the provider but not something we can read. Acknowledged anyway:
      // redelivering the same bytes cannot make them valid.
      this.logger.error({ err: error }, 'webhook event is malformed; acknowledged unapplied');
      return { received: true, applied: false };
    }

    return this.webhooks.handle(event);
  }
}

function unauthorizedWebhook(): ProblemException {
  return new ProblemException('unauthorized', {
    detail: 'The webhook signature is missing or does not verify.',
  });
}
