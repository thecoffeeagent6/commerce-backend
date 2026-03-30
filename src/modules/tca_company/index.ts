import { Module } from "@medusajs/framework/utils"
import { TCA_COMPANY_MODULE } from "./constants"
import TcaCompanyModuleService from "./service"

export { TCA_COMPANY_MODULE } from "./constants"

export default Module(TCA_COMPANY_MODULE, {
  service: TcaCompanyModuleService,
})
